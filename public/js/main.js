function AposPeople(optionsArg) {
  var self = this;
  var options = {
    instance: 'person',
    name: 'people'
  };
  $.extend(options, optionsArg);
  AposSnippets.call(self, options);

  var simpleFields = [ 'firstName', 'lastName', 'name', 'login', 'email', 'phone' ];

  function findExtraFields($el, data, callback) {

    _.each(simpleFields, function(field) {
      snippet[field] = $el.findByName(apos.cssName(field)).val();
    });

    if (snippet.login) {
      snippet.username = $el.findByName('username').val();
      snippet.password = $el.findByName('password').val();
    }

    callback();
  }

  self.afterPopulatingEditor = function($el, snippet, callback) {
    _.each(simpleFields, function(field) {
      $el.findByName(apos.cssName(field)).val(snippet[field]);
    });

    callback();
  };

  self.addingToManager = function($el, $snippet, snippet) {
    $snippet.find('[data-first-name').val(snippet.firstName);
    $snippet.find('[data-last-name').val(snippet.lastName);
    $snippet.find('[data-login').val(snippet.login ? 'Yes' : 'No');
    $snippet.find('[data-username').val(snippet.username);
    $snippet.find('[data-published').val(snippet.published ? 'Yes' : 'No');

    if (snippet.tags !== null) {
      $snippet.find('[data-tags]').text(snippet.tags);
    }
  };

  self.beforeInsert = function($el, data, callback) {
    findExtraFields($el, data, callback);
  };

  self.beforeUpdate = function($el, data, callback) {
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

