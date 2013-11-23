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

    // Custom behaviors to conveniently set full name and title

    var usernameFocused = false;

    var $firstName = $el.findByName('firstName');
    var $lastName = $el.findByName('lastName');

    $firstName.change(updateName);
    $lastName.change(updateName);
    $firstName.change(updateUsername);
    $lastName.change(updateUsername);

    // Suggest full name if none yet or it doesn't have both first and last yet
    function updateName() {
      var $name = $el.findByName('title');
      if ($name.val().indexOf(' ') === -1) {
        $name.val(($firstName.val() + ' ' + $lastName.val()).replace(/ +$/, ''));
      }
      return true;
    }

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

    // Generate a recommended, strong password for any new user
    function recommendPassword() {
      var $suggestedPassword = $el.find('[data-suggested-password]');
      var $password = $el.findByName('password');

      $.post(self._action + '/generate-password', {}, function(data) {
        $suggestedPassword.find('[data-suggestion]').text(data.password);
        $suggestedPassword.show();
        $password.val(data.password);
      });
    }

    if (snippet.username === undefined) {
      recommendPassword();
    }

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
      apos.log($group[0]);
      $el.find('[data-groups]').append($group);
    });

    callback();
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
    $('body').on('click', '[data-edit-profile]', function() {
      $.getJSON(self._action + '/profile', function(data) {
        if (data.status !== 'ok') {
          alert('A server error occurred.');
          return;
        }
        var profile = data.profile;
        var fields = data.fields;
        var $profile = $(data.template);
        apos.modal($profile, {
          init: function(callback) {
            return self.populateSomeFields($profile, fields, profile, callback);
          },
          save: function(callback) {
            return self.convertSomeFields($profile, fields, profile, function() {
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
}

AposPeople.addWidgetType = function(options) {
  if (!options) {
    options = {};
  }
  _.defaults(options, {
    name: 'people',
    label: 'People',
    action: '/apos-people',
    defaultLimit: 5
  });
  AposSnippets.addWidgetType(options);
};

