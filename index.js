var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var snippets = require('apostrophe-snippets');
var util = require('util');
var moment = require('moment');
var passwordHash = require('password-hash');
var pwgen = require('xkcd-pwgen');

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

  // TODO this is kinda ridiculous. We need to have a way to call a function that
  // adds some routes before the static route is added. Maybe the static route should
  // be moved so it can't conflict with anything.
  if (!options.addRoutes) {
    options.addRoutes = addRoutes;
  } else {
    var superAddRoutes = options.addRoutes;
    options.addRoutes = function() {
      addRoutes();
      superAddRoutes();
    };
  }

  function addRoutes() {
    self._app.post(self._action + '/username-unique', function(req, res) {
      self._apos.permissions(req, 'edit-people', null, function(err) {
        if (err) {
          res.statusCode = 404;
          return res.send('notfound');
        }
        return generate();
      });

      function generate() {
        var username = req.body.username;
        var done = false;
        async.until(function() { return done; }, attempt, after);
        function attempt(callback) {
          var users = self.get(req, { username: username }, function(err, results) {
            if (err) {
              return callback(err);
            }
            if (results.snippets.length) {
              username += Math.floor(Math.random() * 10);
              return callback(null);
            }
            done = true;
            return callback(null);
          });
        }
        function after(err) {
          if (err) {
            res.statusCode = 500;
            return res.send('error');
          }
          return res.send({ username: username });
        }
      }
    });

    self._app.post(self._action + '/generate-password', function(req, res) {
      self._apos.permissions(req, 'edit-profile', null, function(err) {
        if (err) {
          res.statusCode = 404;
          return res.send('notfound');
        }
        return generate();
      });
      function generate() {
        return res.send({ password: pwgen.generatePassword() });
      }
    });
  }

  // Call the base class constructor. Don't pass the callback, we want to invoke it
  // ourselves after constructing more stuff
  snippets.Snippets.call(this, options, null);

  self.getAutocompleteTitle = function(snippet) {
    var title = snippet.title;
    // Disambiguate
    if (snippet.login) {
      title += ' (' + snippet.username + ')';
    } else {
      title += ' (' + snippet.slug + ')';
    }
    return title;
  };

  // I bet you want some extra fields available along with the title to go with
  // your custom getAutocompleteTitle. Override this to retrieve more stuff.
  // We keep it to a minimum for performance.
  self.getAutocompleteFields = function() {
    return { title: 1, firstName: 1, lastName: 1, _id: 1, login: 1, username: 1 };
  };

  // Attach the groups module to this module, has to be done after initialization
  // because we initialize the users module first. We need access to the groups module
  // in order to perform joins properly. This is not how groups are
  // attached to individual people, note the groupIds property on persons.

  self.setGroups = function(groupsArg) {
    self._groups = groupsArg;
  };

  var superGet = self.get;

  // Adjust sort order, accept the 'login' boolean criteria,
  // join with groups, delete the password field before returning

  self.get = function(req, optionsArg, callback) {
    var options = {};

    // "Why copy the object like this?" If we don't, we're modifying the
    // object that was passed to us, which could lead to side effects
    extend(options, optionsArg || {}, true);

    self._apos.convertBooleanFilterCriteria('login', options);

    var getGroups = true;
    if (options.getGroups === false) {
      getGroups = false;
    }
    delete options.getGroups;

    if (!options.sort) {
      options.sort = { lastName: 1, firstName: 1 };
    }
    return superGet.call(self, req, options, function(err, results) {
      if (err) {
        return callback(err);
      }
      if (self._groups) {
        // Avoid infinite recursion by passing getPeople: false
        return self._apos.joinOneToMany(req, results.snippets, 'groupIds', '_groups', { get: self._groups.get, getOptions: { getPeople: false } }, function(err) {
          if (err) {
            return callback(err);
          }
          return callback(null, results);
        });
      } else {
        return callback(null, results);
      }
    });
  };

  function appendExtraFields(data, snippet, callback) {
    snippet.firstName = self._apos.sanitizeString(data.firstName, 'Jane');
    snippet.lastName = self._apos.sanitizeString(data.lastName, 'Public');

    snippet.login = self._apos.sanitizeBoolean(data.login);
    snippet.username = self._apos.sanitizeString(data.username);

    // Leading _ is a mnemonic reminding me to NOT store plaintext passwords directly!
    var _password = self._apos.sanitizeString(data.password, null);

    if ((!snippet.password) || (_password !== null)) {
      if (_password === null) {
        _password = self._apos.generateId();
      }
      // password-hash npm module generates a lovely string formatted:
      //
      // algorithmname:salt:hash
      //
      // With a newly generated salt. So before you ask, yes, a salt is being used here
      snippet.password = passwordHash.generate(_password);
    }

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

