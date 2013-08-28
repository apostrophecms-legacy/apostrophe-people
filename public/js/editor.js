// JavaScript which enables editing of this module's content belongs here.

function AposPeople(optionsArg) {
  var self = this;
  var options = {
    instance: 'person',
    name: 'people'
  };
  $.extend(options, optionsArg);
  AposSnippets.call(self, options);

  var simpleFields = [ 'firstName', 'lastName', 'login', 'username', 'email', 'phone' ];

  function findExtraFields($el, data, callback) {
    _.each(simpleFields, function(field) {
      data[field] = $el.findByName(apos.cssName(field)).val();
    });

    data.password = $el.findByName('password').val();

    callback();
  }

  self.afterPopulatingEditor = function($el, snippet, callback) {
    _.each(simpleFields, function(field) {
      $el.findByName(apos.cssName(field)).val(snippet[field]);
    });
    // Boolean fields must get an explicit '1' or '0' for
    // the select element
    $el.find('[name="login"]').val(snippet.login ? '1' : '0');
    var usernameFocused = false;
    var $firstName = $el.findByName('first-name');
    var $lastName = $el.findByName('last-name');

    $firstName.change(updateName);
    $lastName.change(updateName);
    $firstName.change(updateUsername);
    $lastName.change(updateUsername);

    // Do not prepopulate password

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
    } else {
      // Hide this when editing existing users
      $el.find('[data-suggested-password]').hide();
    }

    // Read-only display of group memberships and titles. TODO:
    // allow this to be edited from the person's side.
    _.each(snippet._groups || [], function(group) {
      var $group = apos.fromTemplate($el.find('[data-groups] [data-group]'));
      $group.find('[data-name]').text(group.title);
      var $jobTitle = $group.find('[data-job-title]');
      var extra = snippet.groupExtras[group._id];
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

  self.beforeSave = function($el, data, callback) {
    findExtraFields($el, data, callback);
  };
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

