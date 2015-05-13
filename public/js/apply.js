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
      self.url = self._action + '/apply';
      $.getJSON(self.url, function(data) {
        if (data.status !== 'ok') {
          alert('A server error occurred.');
          return;
        }
        self.piece = data.piece;
        self.fields = data.fields;
        self.$piece = $(data.template);
        // otherwise selectize politely refuses to work
        self.$piece.removeClass('apos-template');
        apos.modal(self.$piece, {
          init: self.init,
          save: self.save
        });
      });
    });
  };

  self.init = function(callback) {
    return async.series([
      self.beforePopulateFields,
      self.populateFields,
      self.afterPopulateFields
    ], callback);
  };

  self.beforePopulateFields = function(callback) {
    return apos.afterYield(callback);
  };

  self.populateFields = function(callback) {
    return aposSchemas.populateFields(self.$piece, self.fields, self.piece, function() {
      // Leverage the same enhancements that the people module uses
      // when admins edit people
      var people = aposPages.getType('people');
      people.suggestName(self.$piece, self.piece);
      people.suggestUsername(self.$piece, self.piece);
      people.suggestPassword(self.$piece, self.piece);
      return callback();
    });
  };

  self.afterPopulateFields = function(callback) {
    return apos.afterYield(callback);
  };

  self.save = function(callback) {
    return async.series([
      self.beforeConvertFields,
      self.convertFields,
      self.afterConvertFields
    ], function(err) {
      if (err) {
        return callback(err);
      }
      $.jsonCall(self.url, self.piece, function(result) {
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
  };

  self.beforeConvertFields = function(callback) {
    return apos.afterYield(callback);
  };

  self.convertFields = function(callback) {
    return aposSchemas.convertFields(self.$piece, self.fields, self.piece, callback);
  };

  self.afterConvertFields = function(callback) {
    return apos.afterYield(callback);
  };

  return self;
}
