var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var snippets = require('apostrophe-snippets');
var util = require('util');
var moment = require('moment');
var passwordHash = require('password-hash');

// Creating an instance of the people module is easy:
// var people = require('apostrophe-people')(options, callback);
//
// If you want to access the constructor function for use in the
// constructor of a module that extends this one, consider:
//
// var people = require('apostrophe-people');
// ... Inside the constructor for the new object ...
// people.People.call(this, options, null);
//
// In fact, this module does exactly that to extend the snippets module
// (see below). Something similar happens on the browser side in
// main.js.

module.exports = people;

function people(options, callback) {
  return new people.People(options, callback);
}

people.People = function(options, callback) {
  var self = this;
  _.defaults(options, {
    instance: 'person',
    name: options.name || 'people',
    label: options.name || 'People',
    icon: options.icon || 'people',
    // The default would be aposPeoplePostMenu, this is more natural
    menuName: 'aposPeopleMenu'
  });

  options.modules = (options.modules || []).concat([ { dir: __dirname, name: 'people' } ]);

  // Call the base class constructor. Don't pass the callback, we want to invoke it
  // ourselves after constructing more stuff
  snippets.Snippets.call(this, options, null);

  self.getAutocompleteTitle = function(snippet) {
    var name = snippet.name;
    // Disambiguate
    if (snippet.login) {
      name += ' (' + snippet.slug + ')';
    }
    return name;
  };

  // I bet you want some extra fields available along with the title to go with
  // your custom getAutocompleteTitle. Override this to retrieve more stuff.
  // We keep it to a minimum for performance.
  self.getAutocompleteFields = function() {
    return { name: 1, _id: 1 };
  };

  // Establish the default sort order for peoples
  var superGet = self.get;

  self.get = function(req, optionsArg, callback) {
    var options = {};

    // "Why copy the object like this?" If we don't, we're modifying the
    // object that was passed to us, which could lead to side effects
    extend(options, optionsArg || {}, true);

    self._apos.convertBooleanFilterCriteria('login', options);

    if (!options.sort) {
      options.sort = { lastName: 1, firstName: 1 };
    }
    return superGet.call(self, req, options, callback);
  };

  function appendExtraFields(data, snippet, callback) {
    snippet.firstName = self._apos.sanitizeString(data.firstName, 'Jane');
    snippet.lastName = self._apos.sanitizeString(data.lastName, 'Public');
    snippet.name = self._apos.sanitizeString(data.name, 'Jane Q. Public');

    snippet.login = self._apos.sanitizeBoolean(data.login);
    snippet.username = self._apos.sanitizeString(data.username);
    // Just in case browser side JS somehow fails miserably, default to a secure password
    // leading _ is a mnemonic reminding me to NOT store plaintext passwords directly!
    var _password = self._apos.sanitizeString(data.password, self._apos.generateId());
    // password-hash npm module generates a lovely string formatted:
    //
    // algorithmname:salt:hash
    //
    // ...So before you ask, yes, a salt *is* being used here
    snippet.password = passwordHash.generate(_password);

    snippet.email = self._apos.sanitizeString(data.email);
    snippet.phone = self._apos.sanitizeString(data.phone);
    return callback(null);
  }

  self.beforeInsert = function(req, data, snippet, callback) {
    appendExtraFields(data, snippet, callback);
  };

  self.beforeUpdate = function(req, data, snippet, callback) {
    appendExtraFields(data, snippet, callback);
  };

  var superAddApiCriteria = self.addApiCriteria;
  self.addApiCriteria = function(query, criteria) {
    superAddApiCriteria.call(self, query, criteria);
    criteria.login = 'any';
  };

  if (callback) {
    // Invoke callback on next tick so that the people object
    // is returned first and can be assigned to a variable for
    // use in whatever our callback is invoking
    process.nextTick(function() { return callback(null); });
  }
};

