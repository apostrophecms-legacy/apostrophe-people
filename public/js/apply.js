// JavaScript which enables display of this module's content
// to logged-out users belongs here.

// Bootstrap the account application process. Most of the needed code is loaded
// on the fly (the schemas module)

function AposPeopleApply(options) {
  var self = this;
  self._action = options.action;

  $('body').on('click', '[data-people-login-or-apply]', function() {
    var afterLogin = $(this).attr('data-after-login');
    $.cookie('aposAfterLogin', afterLogin, { expires: 7, path: '/' });
    var $el = apos.modalFromTemplate('.apos-people-login-or-apply', {
      init: function(callback) {
        $el.on('click', '[data-apply]', function() {
          $el.trigger('aposModalHide');
          self.applyModal();
          return false;
        });
        return callback();
      }
    });
    return false;
  });

  $('body').on('click', '[data-people-apply]', function() {
    self.applyModal();
    return false;
  });

  self.applyModal = function() {
    // Make sure we have access to the functionality of apostrophe-schemas,
    // user.js in the apostrophe module, etc.
    apos.requireScene('user', function() {
      var url = self._action + '/apply';
      $.getJSON(url, function(data) {
        if (data.status !== 'ok') {
          alert('A server error occurred.');
          return;
        }
        var piece = data.piece;
        var fields = data.fields;
        var $piece = $(data.template);
        apos.modal($piece, {
          init: function(callback) {
            return aposSchemas.populateFields($piece, fields, piece, function() {
              // Leverage the same enhancements that the people module uses
              // when admins edit people
              var people = aposPages.getType('people');
              people.suggestName($piece, piece);
              people.suggestUsername($piece, piece);
              people.suggestPassword($piece, piece);
              return callback();
            });
          },
          save: function(callback) {
            return aposSchemas.convertFields($piece, fields, piece, function(err) {
              if (err) {
                return callback(err);
              }
              $.jsonCall(url, piece, function(result) {
                if (result.status === 'duplicateEmail') {
                  alert('That email address is already in use. If you have lost access to your account try resetting your password.');
                  return callback('error');
                }
                if (result.status === 'duplicateUsername') {
                  alert('That username is already in use. Try another.');
                  return callback('error');
                }
                if (result.status !== 'ok') {
                  alert('An error occurred. Please try again.');
                  return callback('error');
                }
                if (result.confirmed) {
                  alert('Your account is ready to use!');
                  apos.data.user = result.user;
                  apos.afterLogin();
                  return callback(null);
                } else {
                  alert('To protect your privacy, you will receive confirmation of your new account by email. You must click on the link in that email to confirm your account.');
                  return callback(null);
                }
              });
            });
          }
        });
      });
    });
  };
}
