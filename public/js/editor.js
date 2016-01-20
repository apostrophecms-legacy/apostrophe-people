// JavaScript which enables editing of this module's content belongs here.

function AposPeople(optionsArg) {
  var self = this;
  var options = {
    instance: 'person',
    name: 'people'
  };
  $.extend(options, optionsArg);
  AposSnippets.call(self, options);

  self.afterPopulatingEditor = function($el, snippet, callback) {

    // Quick and dirty fix to hide the copy function as copying people won't
    // work to anybody's satisfaction. Would be nice if it wasn't there in
    // the first place. (There is no security issue with not disabling it fully
    // as only admins can edit people in the first place.)
    $el.find('[data-action="copy"]').remove();

    self.suggestName($el, snippet);
    self.suggestUsername($el, snippet);
    self.suggestPassword($el, snippet);

    // Read-only display of group memberships and titles. TODO:
    // allow this to be edited from the person's side. Even more
    // important TODO: fix it to work like schema joins so it can
    // just be one.

    _.each(snippet._groups || [], function(group) {
      var $group = apos.fromTemplate($el.find('[data-groups] [data-group]'));
      $group.find('[data-name]').text(group.title);
      var $jobTitle = $group.find('[data-job-title]');

      var extra = function() {
        if (snippet.groupExtras){
          return snippet.groupExtras[group._id];
        } else {
          return false;
        }
      };
      if (extra && extra.jobTitle) {
        $group.find('[data-job-title]').text(extra.jobTitle);
      } else {
        $group.find('[data-job-title]').remove();
      }
      $el.find('[data-groups]').append($group);
    });

    callback();
  };

  // Conveniently suggest full name when appropriate. Used both here
  // and in apply.js

  self.suggestName = function($el, snippet) {
    var $firstName = $el.findByName('firstName');
    var $lastName = $el.findByName('lastName');

    $firstName.change(updateName);
    $lastName.change(updateName);

    // Suggest full name if none yet or it doesn't have both first and last yet
    function updateName() {
      var $name = $el.findByName('title');
      var firstName = $firstName.val();
      var lastName = $lastName.val();
      if (firstName.length && lastName.length && (!$name.val().length)) {
        var suggestion = (firstName + ' ' + lastName);
        $name.val(suggestion);
      }
      return true;
    }
  };

  // Suggest username when appropriate. Used both here and in apply.js

  self.suggestUsername = function($el, snippet) {
    var $firstName = $el.findByName('firstName');
    var $lastName = $el.findByName('lastName');

    var usernameFocused = false;

    $firstName.change(updateUsername);
    $lastName.change(updateUsername);

    var $username = $el.findByName('username');

    // Keep updating the username suggestion until they focus that field.
    // Of course we don't mess with existing usernames.
    function updateUsername() {
      var $username = $el.findByName('username');
      if ((!usernameFocused) && (snippet.username === undefined)) {
        var username = apos.slugify($firstName.val() + $lastName.val());
        $.post(self._action + '/username-unique', { username: username }, function(data) {
          $username.val(data.username);
        });
      }
      $username.on('focus', function() {
        usernameFocused = true;
      });
    }
  };

  // Generate a recommended, strong password for any new user. If your
  // $el has no element with a data-suggested-password attribute, then
  // this method does nothing. That allows designers who don't feel
  // the suggested passwords are useful to skip that feature. If such
  // an element does exist, a further element within it with a
  // data-suggestion attribute is looked for, and its text is set to
  // the suggested password.

  self.suggestPassword = function($el, snippet) {
    function recommendPassword() {
      var $suggestedPassword = $el.find('[data-suggested-password]');
      if ($suggestedPassword.length) {
        var $password = $el.findByName('password');

        $.post(self._action + '/generate-password', {}, function(data) {
          $suggestedPassword.find('[data-suggestion]').text(data.password);
          $suggestedPassword.show();
          $password.val(data.password);
        });
      }
    }

    if (snippet.username === undefined) {
      recommendPassword();
    }
  };

  self.addingToManager = function($el, $snippet, snippet) {
    $snippet.find('[data-first-name]').val(snippet.firstName);
    $snippet.find('[data-last-name]').val(snippet.lastName);
    $snippet.find('[data-login]').val(snippet.login ? 'Yes' : 'No');
    $snippet.find('[data-username]').val(snippet.username);
    $snippet.find('[data-published]').val(snippet.published ? 'Yes' : 'No');

    if (snippet.tags !== null) {
      $snippet.find('[data-tags]').text(snippet.tags);
    }
  };

  if (self.manager) {
    // Edit a personal profile
    // Used profile-edit instead of edit-profile to avoid conflict when
    // someone names a snippet instance type "profile." -Tom
    $('body').on('click', '[data-profile-edit]', function() {
      $.getJSON(self._action + '/profile', function(data) {
        if (data.status !== 'ok') {
          alert('A server error occurred.');
          return;
        }
        var profile = data.profile;
        var fields = data.fields;
        var $profile = $(data.template);
        $profile.removeClass('apos-template');
        apos.modal($profile, {
          init: function(callback) {
            return self.populateSomeFields($profile, fields, profile, callback);
          },
          save: function(callback) {
            return self.convertSomeFields($profile, fields, profile, function(err) {
              if (err) {
                // Balk on "required" or similar error
                aposSchemas.scrollToError($profile);
                return callback(err);
              }
              $.jsonCall(self._action + '/profile', profile, function(result) {
                if (result.status !== 'ok') {
                  alert('An error occurred. Please try again.');
                  return callback('error');
                }
                // Profile edits can change the user's name, which has ripple effects
                // possibly including the outer layout. So refresh the page
                window.location.reload();
              });
            });
          }
        });
      });
      return false;
    });
  }

  $('body').on('click', '[data-password-change]', function(){
    var tagEditor = new AposPasswordEditor({action: self._action});
    tagEditor.modal();
    return false;
  });
}

function AposPasswordEditor(options) {
  var self = this;
  if (!options) {
    options = {};
  }
  self._action = options.action || '/apos-people';

  // Call this method after constructing the object
  self.modal = function() {
    self.$el = apos.modalFromTemplate('.apos-password-editor', self);
  };

  self.init = function(callback) {
    return callback(null);
  }

  self.save = function(callback) {
    // validate passwords match and fields are entered
    var oldPassword = self.$el.findByName('oldPassword').val();
    var newPassword = self.$el.findByName('newPassword').val();
    var confirmPassword = self.$el.findByName('confirmPassword').val();

    if (!oldPassword){
      //error
      aposSchemas.addError(self.$el, 'oldPassword', true);
      return callback('Old Password is required');
    }
    if (!newPassword){
      //error
      aposSchemas.addError(self.$el, 'newPassword', true);
      return callback('New Password is required');
    }
    if (!confirmPassword){
      //error
      aposSchemas.addError(self.$el, 'confirmPassword', true);
      return callback('Password confirmation is required');
    }
    if (newPassword !== confirmPassword){
      //error
      aposSchemas.addError(self.$el, 'newPassword');
      alert('New passwords did not match');
      return callback('New Passwords did not match');
    }

    $.jsonCall(
      self._action + '/change-password',
      {
        oldPassword: oldPassword,
        newPassword: newPassword
      },
      function(data) {
        if (data.status == 'ok') {
          alert('Your password has been changed');
          return callback(null);
        } else {
          alert('You did not enter your old password correctly');
          return callback('You did not enter your old password correctly');
        }
      },
      function(data) {
        alert('An error occurred. Please try again.');
        return callback('An error occurred in server response');
      }
    );


  }
}
