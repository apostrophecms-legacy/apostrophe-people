var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var snippets = require('apostrophe-snippets');
var util = require('util');
var moment = require('moment');
var passwordHash = require('password-hash');
var pwgen = require('xkcd-pwgen');
var nodemailer = require('nodemailer');

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
    label: options.label || 'People',
    instanceLabel: options.instanceLabel || 'Person',
    icon: options.icon || 'people',
    groupsType: 'groups',
    // The default would be aposPeoplePostMenu, this is more natural
    menuName: 'aposPeopleMenu',
    profileFields: [
      'thumbnail', 'body'
    ],
    // The plan is for the groups module to provide an enhanced Directory widget
    // that also covers people
    widget: false
  });

  options.addFields = [ {
    name: 'thumbnail',
    label: 'Picture',
    type: 'singleton',
    widgetType: 'slideshow',
    options: {
      label: 'Picture',
      limit: 1
    }
  } ].concat(options.addFields || []);

  self._profileFields = options.profileFields;

  self._groupsType = options.groupsType;

  options.modules = (options.modules || []).concat([ { dir: __dirname, name: 'people' } ]);

  self.options = options;

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

  /**
   * Deprecated - bc - unnecessary
   */
   self.setGroups = function(groups) {};

  /**
   * Make a username unique. Invokes callback with null and a unique
   * version of the username, or with an error if any. Does not
   * address race conditions.
   * @param  {String}   username
   * @param  {Function} callback
   */
  self.usernameUnique = function(username, callback) {
    var done = false;
    async.until(function() { return done; }, attempt, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, username);
    });

    function attempt(callback) {
      // Go straight to mongo as we need uniqueness and don't care
      // about view permissions or trash status
      var criteria = { type: self._instance, username: username };
      var users = self._apos.pages.findOne(criteria, function(err, existing) {
        if (err) {
          return callback(err);
        }
        if (existing) {
          username += Math.floor(Math.random() * 10);
          return callback(null);
        }
        done = true;
        return callback(null);
      });
    }
  };

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
        return self.usernameUnique(username, function(err, usernameArg) {
          username = usernameArg;
          if (err) {
            res.statusCode = 500;
            return res.send('error');
          }
          return res.send({ username: username });
        });
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

    self._app.get(self._action + '/reset-request', function(req, res) {
      return res.send(self.renderPage('resetRequest', {}, 'anon'));
    });

    self._app.post(self._action + '/reset-request', function(req, res) {
      var login;
      var person;
      var reset;
      var done;
      return async.series({
        validate: function(callback) {
          login = self._apos.sanitizeString(req.body.username);
          if (!login) {
            return callback('A response is required.');
          }
          return callback(null);
        },
        get: function(callback) {
          return self._apos.pages.findOne({
            type: 'person',
            login: true,
            email: { $ne: '' },
            $or: [ { username: login }, { email: login } ]
          }, function(err, page) {
            if (err) {
              return callback(err);
            }
            if (!page) {
              return callback('No user with that username or email address was found, or there is no email address associated with your account. Please try again or contact your administrator.');
            }
            person = page;
            return callback(null);
          });
        },
        generate: function(callback) {
          reset = self._apos.generateId();
          return callback(null);
        },
        save: function(callback) {
          return self._apos.pages.update({
            _id: person._id
          }, {
            $set: {
              resetPassword: reset
            }
          }, callback);
        },
        send: function(callback) {
          var options = self.options.email || {};
          _.defaults(options, {
            // transport and transportOptions are ignored if self.options.mailer
            // has been passed when constructing the module, as apostrophe-site will
            // always do
            transport: 'sendmail',
            transportOptions: {},
            subject: 'Your request to reset your password on %HOST%'
          });
          if (!self._mailer) {
            if (self.options.mailer) {
              // This will always work with apostrophe-site
              self._mailer = self.options.mailer;
            } else {
              // An alternative for those not using apostrophe-site
              self._mailer = nodemailer.createTransport(options.transport, options.transportOptions);
            }
          }
          var subject = options.subject.replace('%HOST%', req.host);
          if (!req.absoluteUrl) {
            // Man, Express really needs this
            req.absoluteUrl = req.protocol + '://' + req.get('Host') + req.url;
          }
          var url = req.absoluteUrl.replace('reset-request', 'reset') + '?reset=' + reset;
          self._mailer.sendMail({
            from: options.from || 'Password Reset <donot@reply.example.com>',
            to: person.title.replace(/[<\>]/g, '') + ' <' + person.email + '>',
            subject: subject,
            text: self.render('resetRequestEmail.txt', {
              url: url,
              host: req.host
            }),
            html: self.render('resetRequestEmail.html', {
              url: url,
              host: req.host
            })
          }, function(err, response) {
            if (err) {
              return callback(err);
            }
            done = true;
            return callback(null);
          });
        }
      }, function(err) {
        return res.send(self.renderPage(done ? 'resetRequestSent' : 'resetRequest', { message: err }, 'anon'));
      });
    });

    self._app.all(self._action + '/reset', function(req, res) {
      var reset;
      var person;
      var password;
      var template = 'reset';
      return async.series({
        validate: function(callback) {
          reset = self._apos.sanitizeString(req.query.reset || req.body.reset);
          if (!reset) {
            return callback('You may have copied and pasted the link incorrectly. Please check the email you received.');
          }
          if (req.method === 'POST') {
            if (req.body.password1 !== req.body.password2) {
              return callback('Passwords do not match.');
            }
            password = self._apos.sanitizeString(req.body.password1);
            if (!password) {
              return callback('Please supply a new password.');
            }
          }
          return callback(null);
        },
        get: function(callback) {
          return self._apos.pages.findOne({ type: 'person', resetPassword: reset, login: true }, function(err, page) {
            if (err) {
              return callback(err);
            }
            if (!page) {
              template = 'resetFail';
              return callback(null);
            }
            person = page;
            return callback(null);
          });
        },
        update: function(callback) {
          if (req.method !== 'POST') {
            return callback(null);
          }
          password = self.hashPassword();
          return self._apos.pages.update({ _id: person._id }, { $set: { password: password }, $unset: { $resetPassword: 1 } }, function(err, count) {
            if (err || (!count)) {
              // A database error, or they didn't succeed because someone else logged in.
              // Still not a good idea to disclose much information
              template = 'resetFail';
              return callback(null);
            }
            template = 'resetDone';
            return callback(null);
          });
        }
      }, function(err) {
        return res.send(self.renderPage(template, { message: err, reset: reset }, 'anon'));
      });
    });

    self._app.all(self._action + '/profile', function(req, res) {
      if (!req.user) {
        return res.send({ 'status': 'notfound' });
      }
      var subsetFields = _.filter(self.convertFields, function(field) {
        return _.contains(self._profileFields, field.name);
      });
      var snippet = { areas: {} };

      // TODO: merge these fields into the schema to remove redundant code like this
      snippet.firstName = req.user.firstName;
      snippet.lastName = req.user.lastName;
      snippet.title = req.user.title;

      _.each(subsetFields, function(field) {
        if ((field.type === 'area') || (field.type === 'singleton')) {
          snippet.areas[field.name] = req.user.areas[field.name];
        } else {
          snippet[field.name] = req.user[field.name];
        }
      });
      if (req.method === 'POST') {
        var set = { areas: {} };
        self.convertSomeFields(subsetFields, 'form', req.body, set);
        if (req.body.firstName !== undefined) {
          set.firstName = req.body.firstName;
        }
        if (req.body.lastName !== undefined) {
          set.lastName = req.body.lastName;
        }
        if (req.body.title !== undefined) {
          set.title = req.body.title;
        }
        var user;
        // We can't just do an update query because we want
        // overrides of putOne to be respected. Get the user again,
        // via getPage, so that no joins or excessive cleverness like
        // deletion of the password field come into play.
        return async.series({
          get: function(callback) {
            console.log('get');
            return self._apos.getPage(req, req.user.slug, { permissions: false }, function(err, snippet) {
              if (err) {
                return callback(err);
              }
              if (!snippet) {
                return callback('notfound');
              }
              user = snippet;
              return callback(null);
            });
          },
          put: function(callback) {
            console.log('put');
            extend(true, user, set);
            return self.putOne(req, req.user.slug, { permissions: false }, user, callback);
          }
        }, function(err) {
          res.send({ status: err ? 'error' : 'ok' });
        });
      } else {
        return res.send({ status: 'ok', profile: snippet, fields: subsetFields, template: self.render('profileEditor', { fields: subsetFields }) });
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
    return { title: 1, firstName: 1, lastName: 1, _id: 1, login: 1, username: 1, slug: 1 };
  };

  self.getGroupsManager = function() {
    return self._pages.getType(self._groupsType);
  };

  self.getGroupsInstance = function() {
    return self.getGroupsManager()._instance;
  };

  var superGet = self.get;

  // Adjust sort order, accept the 'login' boolean criteria,
  // join with groups, delete the password field before returning

  self.get = function(req, userCriteria, optionsArg, callback) {
    var options = {};
    var filterCriteria = {};

    // "Why copy the object like this?" If we don't, we're modifying the
    // object that was passed to us, which could lead to side effects
    extend(options, optionsArg || {}, true);

    self._apos.convertBooleanFilterCriteria('login', options, filterCriteria);

    if (options.letter) {
      filterCriteria.lastName = RegExp("^" + RegExp.quote(options.letter), 'i');
    }

    var getGroups = true;
    if (options.getGroups === false) {
      getGroups = false;
    }

    if (!options.sort) {
      options.sort = { lastName: 1, firstName: 1 };
    }

    var criteria = {
      $and: [
        userCriteria,
        filterCriteria
      ]
    };

    if ((options.groupIds && options.groupIds.length) || (options.notGroupIds && options.notGroupIds.length)) {
      var $and = [];
      if (options.groupIds && options.groupIds.length) {
        $and.push({ groupIds: { $in: options.groupIds } });
      }
      if (options.notGroupIds && options.notGroupIds.length) {
        $and.push({ groupIds: { $nin: options.notGroupIds } });
      }
      $and.push(criteria);
      criteria = { $and: $and };
    }

    return superGet.call(self, req, criteria, options, function(err, results) {
      if (err) {
        return callback(err);
      }
      _.each(results.snippets, function(snippet) {
        // Read access to the password is strictly via Appy's local strategy, anything else
        // must consider it write-only
        delete snippet.password;
      });
      if (getGroups) {
        // Avoid infinite recursion by passing getPeople: false
        // Let the groups permalink to their own best directory pages
        return self._apos.joinByArray(req, results.snippets, 'groupIds', undefined, '_groups', { get: self.getGroupsManager().get, getOptions: { getPeople: false, permalink: true } }, function(err) {
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

  // The page needs to be a directory page, served by the groups
  // module

  self.permalink = function(req, snippet, page, callback) {
    snippet.url = page.slug + '/' + snippet.slug;
    return callback(null);
  };

  function appendExtraFields(data, snippet, callback) {
    return callback(null);
  }

  self.beforeSave = function(req, data, snippet, callback) {
    var oldUsername = snippet.username;

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
      snippet.password = self.hashPassword(_password);
    }

    snippet.email = self._apos.sanitizeString(data.email);
    snippet.phone = self._apos.sanitizeString(data.phone);

    if (snippet.username !== oldUsername) {
      return self.usernameUnique(snippet.username, function(err, username) {
        if (err) {
          return callback(err);
        }
        snippet.username = username;
        return callback(null);
      });
    } else {
      return callback(null);
    }
  };

  // Hash a password for storage in mongodb.
  // The password-hash npm module generates a lovely string formatted:
  //
  // algorithmname:salt:hash
  //
  // With a newly generated salt.

  self.hashPassword = function(password) {
    return passwordHash.generate(password);
  };

  var superAddApiCriteria = self.addApiCriteria;
  self.addApiCriteria = function(query, criteria, options) {
    superAddApiCriteria.call(self, query, criteria, options);
    options.login = 'any';
  };

  // The best engine page for a person is the best engine page
  // for their first group: the directory page that suits their
  // first group. TODO: think about the fact that groups don't
  // maintain a guaranteed pecking order right now. Possibly we
  // should guarantee that a user's groups can be ordered

  self.findBestPage = function(req, snippet, callback) {
    if (!req.aposBestPageByGroupId) {
      req.aposBestPageByGroupId = {};
    }
    var groupId = snippet.groupIds ? snippet.groupIds[0] : undefined;
    if (groupId === undefined) {
      // The best engine page for a user with no groups is a general
      // purpose one, best matched by asking for a page for a group
      // with an id no real page will be locked down to.
      return self.getGroupsManager().findBestPage(req, { _id: 'dummy', type: 'group' }, callback);
    }
    var group;
    var page;
    // Cache for performance
    if (req.aposBestPageByGroupId[groupId]) {
      return callback(null, req.aposBestPageByGroupId[groupId]);
    }
    async.series([ getFirstGroup, findBest ], function(err) {
      if (err) {
        return callback(err);
      }
      req.aposBestPageByGroupId[group._id] = page;
      return callback(null, page);
    });
    function getFirstGroup(callback) {
      if (snippet._groups) {
        group = snippet._groups[0];
        return callback(null);
      }
      return self.getGroupsManager().getOne(req, { _id: { $in: snippet._groupIds || [] } }, {}, function(err, groupArg) {
        if (err) {
          return callback(err);
        }
        group = groupArg;
        return callback(null);
      });
    }
    function findBest(callback) {
      // The best engine page for a user with no groups is the
      // best engine page for a nonexistent group
      if (!group) {
        group = { _id: 'dummy', type: 'group' };
      }
      return self.getGroupsManager().findBestPage(req, group, function(err, pageArg) {
        page = pageArg;
        return callback(err);
      });
    }
  };

  // Use a permissions event handler to put the kibosh on
  // any editing of people by non-admins for now. Later we'll have
  // ways to do that safely without access to the login checkbox
  // in certain situations

  self._apos.on('permissions', function(req, action, result) {
    if (action.match(/\-people$/) && (action !== 'view-people')) {
      if (!(req.user && req.user.permissions.admin)) {
        result.response = 'Forbidden';
      }
    }
  });

  var superDispatch = self.dispatch;
  self.dispatch = function(req, callback) {
    console.log('DEPRECATED: the people module should no longer be used to create staff directory pages. Instead use the groups module which is designed to serve up directories using data from both people and groups.');
    return superDispatch.call(this, req, callback);
  };

  var superImportCreateItem = self.importCreateItem;
  self.importCreateItem = function(req, data, callback) {
    if (!data.title) {
      data.title = data.firstName + ' ' + data.lastName;
    }
    return superImportCreateItem(req, data, callback);
  };

  if (callback) {
    // Invoke callback on next tick so that the people object
    // is returned first and can be assigned to a variable for
    // use in whatever our callback is invoking
    process.nextTick(function() { return callback(null); });
  }
};

