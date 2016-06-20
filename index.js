/* jshint node:true */

var async = require('async');
var _ = require('lodash');
var extend = require('extend');
var snippets = require('apostrophe-snippets');
var pwgen = require('xkcd-pwgen');
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

  // Only admins can edit this data type
  self._adminOnly = true;

  self._schemas = options.schemas;

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
      'firstName', 'lastName', 'title', 'thumbnail', 'body'
    ],
    // By default strangers cannot apply for accounts
    apply: false,
    // Only relevant if apply: true is passed
    applyFields: [
      'username', 'password', 'firstName', 'lastName', 'title', 'email'
    ],
    // Only relevant if apply: true is passed
    // Should be the title, not the slug, as it may be
    // necessary to create the group
    applyGroup: 'Guests',
    // Only relevant if apply: true is passed
    applyGroupPermissions: [ 'guest' ],
    // Only relevant if apply: true is passed
    applyConfirm: true,
    // The plan is for the groups module to provide an enhanced Directory widget
    // that also covers people
    widget: false
  });

  options.addFields = [
    {
      name: 'title',
      label: 'Full Name',
      type: 'string'
    },
    {
      name: 'thumbnail',
      label: 'Picture',
      type: 'singleton',
      widgetType: 'slideshow',
      options: {
        label: 'Picture',
        limit: 1
      }
    },
    {
      before: 'title',
      name: 'firstName',
      label: 'First Name',
      type: 'string',

      // Legacy field name. Do not use this feature in new modules
      legacy: 'first-name'
    },
    {
      name: 'lastName',
      label: 'Last Name',
      type: 'string',

      // Legacy field name. Do not use this feature in new modules
      legacy: 'last-name'
    },
    {
      after: 'title',
      name: 'login',
      label: 'Can Log In',
      type: 'boolean',
      def: false
    },
    {
      name: 'username',
      label: 'Username',
      type: 'string',
      autocomplete: false
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password'
    },
    {
      name: 'email',
      label: 'Email',
      type: 'string'
    },
    {
      name: 'phone',
      label: 'Phone',
      type: 'string'
    },
    // This field is defined to assist in importing groups
    // from CSV. The contextual flag prevents it from appearing
    // in forms. -Tom
    {
      name: 'groups',
      label: 'Groups',
      type: 'a2Groups',
      contextual: true
    }
  ].concat(options.addFields || []);

  options.removeFields = [ 'hideTitle' ].concat(options.removeFields || []);

  // If somebody REALLY doesn't want to group their fields,
  // take the hint, otherwise supply a default behavior
  if (options.groupFields !== false) {
    options.groupFields = options.groupFields ||
      // We don't list the title field so it stays on top
      [
        {
          name: 'profile',
          label: 'Profile',
          icon: 'user',
          fields: [
            'firstName', 'lastName', 'title', 'thumbnail', 'body'
          ]
        },
        {
          name: 'user',
          label: 'User',
          icon: 'metadata',
          fields: [
            'username', 'password', 'login'
          ]
        },
        {
          name: 'contact',
          label: 'Contact',
          icon: 'contact',
          fields: [
            'email', 'phone'
          ]
        },
        {
          name: 'admin',
          label: 'Admin',
          icon: 'metadata',
          fields: [
            'published', 'tags'
          ]
        }
      ];
  }

  self._schemas.addFieldType({
    name: 'a2Groups',
    render: function(data) {
      throw new Error('a2Groups should never appear in a form, you probably removed the contextual flag');
    },
    converters: {
      form: function(req, data, name, snippet, field, callback) {
        throw new Error('a2Groups should never appear in a form, you probably removed the contextual flag');
      },
      csv: function(req, data, name, snippet, field, callback) {
        var groups = self._apos.sanitizeString(data.groups).split(/,\s*/);
        snippet.groupIds = snippet.groupIds || [];
        return async.eachSeries(groups, function(groupName, callback) {
          if (typeof(groupName) !== 'string') {
            return callback(null);
          }
          groupName = groupName.trim();
          if (!groupName) {
            return callback(null);
          }
          return self.getGroupsManager().ensureExists(req, groupName, [], function(err, _group) {
            if (err) {
              return callback(err);
            }
            snippet.groupIds.push(_group._id);
            return callback(null);
          });
        }, function(err) {
          if (err) {
            return callback(err);
          }
          return callback(null);
        });
      }
    }
  });

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

      generate();

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
      generate();
      function generate() {
        return res.send({ password: pwgen.generatePassword().replace(/\-/g, ' ') });
      }
    });

    self._app.post(self._action + '/change-password', function(req, res) {
      var __ = res.__;
      var oldPassword,
          newPassword,
          person;
      // use the callback concatination in async.series instead of vars as reset-request does
      return async.series({
        validate: function(callback) {
          oldPassword = self._apos.sanitizeString(req.body.oldPassword);
          newPassword = self._apos.sanitizeString(req.body.newPassword);
          if (!oldPassword) {
            return callback(__('Old Password is required'));
          }
          return callback(null);
        },
        get: function(callback) {
          return self._apos.pages.findOne({
            type: 'person',
            login: true,
            _id: req.user._id
          }, function(err, page) {
            if (err) {
              return callback(err);
            }
            if (!page) {
              return callback(__('No user with that username or email address was found, or there is no email address associated with your account. Please try again or contact your administrator.'));
            }
            person = page;
            return callback(null);
          });
        },
        confirm: function(callback) {
          // confirm oldPassword matches what's in the DB
          if (!passwordHash.verify(oldPassword, person.password)) {
            return callback(__('Old password was incorrect'));
          }
          return callback(null);
        },
        update: function(callback) {
          // save hash of new password in db
          var password = self.hashPassword(newPassword);
          return self._apos.pages.update({ _id: person._id }, { $set: { password: password }, $unset: { $resetPassword: 1 } }, function(err, count) {
            if (err || (!count)) {
              return callback(null);
            }
            return callback(null);
          });
        }
      }, function(err) {
        // res.send error or results
        res.send({ status: (err) ? 'error' : 'ok'});
      });
    });

    self._app.get(self._action + '/reset-request', function(req, res) {
      return res.send(self.renderPage(req, 'resetRequest', {}));
    });

    self._app.post(self._action + '/reset-request', function(req, res) {
      var __ = res.__;
      var login;
      var person;
      var reset;
      var done;
      return async.series({
        validate: function(callback) {
          login = self._apos.sanitizeString(req.body.username);
          if (!login) {
            return callback(__('A response is required.'));
          }
          return callback(null);
        },
        get: function(callback) {
          return self._apos.pages.findOne({
            type: 'person',
            login: true,
            email: { $ne: '' },
            $or: [ { username: login }, { email: self._apos.emailMatch(login) } ]
          }, function(err, page) {
            if (err) {
              return callback(err);
            }
            if (!page) {
              self._apos.emit('peopleResetRequestInvalidLogin', { username: login });
              return callback(__('No user with that username or email address was found, or there is no email address associated with your account. Please try again or contact your administrator.'));
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
          // For bc we still have support for a resetSubject option separate
          // from .email.resetRequestEmailSubject
          var url = self._action + '/reset?reset=' + reset;
          return self.email(req, person, self.options.resetSubject || __('Your request to reset your password on %HOST%'), 'resetRequestEmail', { url: url }, function(err) {
            if (err) {
              return callback(err);
            }
            done = true;
            self._apos.emit('peopleResetRequest', { username: login });
            return callback(null);
          });
        }
      }, function(err) {
        return res.send(self.renderPage(req, done ? 'resetRequestSent' : 'resetRequest', { message: err }));
      });
    });

    self._app.all(self._action + '/reset', function(req, res) {
      var reset;
      var person;
      var password;
      var template = 'reset';
      var __ = res.__;
      return async.series({
        validate: function(callback) {
          reset = self._apos.sanitizeString(req.query.reset || req.body.reset);
          if (!reset) {
            return callback(__('You may have copied and pasted the link incorrectly. Please check the email you received.'));
          }
          if (req.method === 'POST') {
            if (req.body.password1 !== req.body.password2) {
              return callback(__('Passwords do not match.'));
            }
            password = self._apos.sanitizeString(req.body.password1);
            if (!password) {
              return callback(__('Please supply a new password.'));
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
              self._apos.emit('peopleResetInvalidCode', {});
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
          password = self.hashPassword(password);
          return self._apos.pages.update({ _id: person._id }, { $set: { password: password }, $unset: { $resetPassword: 1 } }, function(err, count) {
            if (err || (!count)) {
              // A database error, or they didn't succeed because someone else logged in.
              // Still not a good idea to disclose much information
              template = 'resetFail';
              return callback(null);
            }
            self._apos.emit('peopleReset', person);
            template = 'resetDone';
            return callback(null);
          });
        }
      }, function(err) {
        return res.send(self.renderPage(req, template, { message: err, reset: reset }));
      });
    });

    self._app.all(self._action + '/profile', function(req, res) {
      if (!req.user) {
        return res.send({ 'status': 'notfound' });
      }
      var schemaSubset = self._schemas.subset(self.schema, options.profileFields);
      if (options.profileGroupFields) {
        schemaSubset = self._schemas.refine(schemaSubset, {
          groupFields: options.profileGroupFields
        });
      }

      // Get the entire user object. req.user does not contain joins for
      // performance reasons
      return self.getOne(req, { _id: req.user._id }, { permissions: false }, function(err, _snippet) {
        if (err) {
          return res.send({ status: err ? 'error' : 'ok' });
        }
        if (!_snippet) {
          // Hardcoded user has no profile, UI shouldn't offer it but don't crash
          return res.send({ status: 'notfound' });
        }
        // Never allow this to go over the wire, even hashed it's terrible to do that
        delete _snippet.password;

        // Copy only what we deem appropriate to the object
        // that goes over the wire
        var snippet = self._schemas.subsetInstance(schemaSubset, _snippet);
        if (req.method === 'POST') {
          var set = {};
          var user;
          // We can't just do an update query because we want
          // overrides of putOne to be respected. Get the user again,
          // via getPage, so that no joins or excessive cleverness like
          // deletion of the password field come into play.
          return async.series({
            convert: function(callback) {
              return self._schemas.convertFields(req, schemaSubset, 'form', req.body, set, callback);
            },
            get: function(callback) {
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
              // _.extend, not extend(true). The latter is a merge that appends arrays to existing
              // arrays which is NOT what we want and prevents a user from ever removing anything
              // from a list. _.extend just replaces properties at top level which is what we want here.
              _.extend(user, set);
              return self.putOne(req, req.user.slug, { permissions: false }, user, callback);
            }
          }, function(err) {
            res.send({ status: err ? 'error' : 'ok' });
          });
        } else {
          return res.send({ status: 'ok', profile: snippet, fields: schemaSubset, template: self.render('profileEditor', { fields: schemaSubset }, req) });
        }
      });
    });

    if (options.apply) {
      self._app.all(self._action + '/apply', function(req, res) {
        if (req.user) {
          return res.send({ 'status': 'loggedin' });
        }
        var schemaSubset = [];
        _.each(self.schema, function(field) {
          if (_.contains(options.applyFields, field.name)) {
            var _field = _.cloneDeep(field);
            delete _field.group;
            schemaSubset.push(_field);
          }
        });
        // These fields might not be required for an admin editing a person but
        // for an applicant they are mandatory
        var required = [ 'firstName', 'lastName', 'title', 'email', 'username', 'password' ];
        _.each(schemaSubset, function(field) {
          if (_.contains(required, field.name)) {
            field.required = true;
          }
        });
        var group;
        if (req.method === 'POST') {
          var user = { applicant: true, applied: new Date() };
          return async.series({
            convert: function(callback) {
              return self._schemas.convertFields(req, schemaSubset, 'form', req.body, user, callback);
            },
            ensureGroup: function(callback) {
              if (options.applyGroup === false) {
                return callback(null);
              }
              return self.getGroupsManager().ensureExists(req, options.applyGroup, options.applyGroupPermissions || [], function(err, _group) {
                if (err) {
                  return callback(err);
                }
                group = _group;
                return callback(null);
              });
            },
            beforeSave: function(callback) {
              // Hashes password (can the schema handle this on its own?)
              return self.beforeSave(req, req.body, user, callback);
            },
            previousApplication: function(callback) {
              if (options.applyConfirm === false) {
                return callback(null);
              }
              // If they applied before and have never confirmed, let them
              // try again, don't lock out their email address forever
              return self.getOne(req, { email: self._apos.emailMatch(user.email), applyConfirm: { $exists: true }, login: { $ne: true } }, { permissions: false }, function(err, existing) {
                if (err) {
                  return callback(err);
                }
                if (!existing) {
                  return callback(null);
                }
                return self._apos.pages.remove({ _id: existing._id }, callback);
              });
            },
            put: function(callback) {
              if (options.applyGroup !== false) {
                user.groupIds = [ group._id ];
              }
              if (options.applyConfirm === false) {
                user.login = true;
              } else {
                user.applyConfirm = self._apos.generateId();
              }
              return self.putOne(req, { permissions: false }, user, callback);
            },
            email: function(callback) {
              if (options.applyConfirm === false) {
                return callback(null);
              }
              // For bc we still have support for an applySubject option separate
              // from .email.applyEmailSubject
              return self.email(req, user, self.options.applySubject || res.__('Your request to create an account on {{ host }}'), 'applyEmail', { url: self._action + '/confirm/' + user.applyConfirm }, function(err) {
                if (err) {
                  // Remove the person we just inserted if we have no way
                  // of communicating their confirmation link to them
                  return self._apos.pages.remove({ _id: user._id }, function() {
                    // This is on purpose, the email error is more interesting
                    // than any error from remove
                    return callback(err);
                  });
                }
                return callback(null);
              });
            }
          }, function(err) {
            // Handle instant login if we're not doing confirmation emails
            if ((options.applyConfirm === false) && (!err)) {
              return async.series({
                // Apply the same logic we would apply to a normal login
                beforeSignin: function(callback) {
                  return self._apos.appyBeforeSignin(user, callback);
                },
                // use passport's login method to finish the job
                login: function(callback) {
                  return req.login(user, callback);
                }
              }, function(err) {
                if (err) {
                  return res.send({ status: 'error' });
                } else {
                  delete user.password;
                  self._apos.prunePage(user);
                  return res.send({ status: 'ok', confirmed: true, user: user });
                }
              });
            }
            var safeErrors = [ 'duplicateEmail', 'duplicateUsername' ];
            var status = err ? (_.contains(safeErrors, err.toString()) ? err.toString() : 'error') : 'ok';
            res.send({ status: status });
          });
        } else {

          var piece = self.newInstance();

          // Make the global page available in the
          // apply form. This facilitates including
          // editable content (edited elsewhere).
          //
          // Note that it may be undefined if it hasn't
          // been populated yet.

          return self._apos.getPage(req, 'global', { permissions: false }, function(err, global) {
            if (err) {
              return res.send({ status: 'error' });
            }

            if (!global) {
              // don't crash if there is no global content yet
              global = { slug: 'global' };
            }

            return res.send({
              status: 'ok',
              fields: schemaSubset,
              piece: piece,
              template: self.render(
                'apply', {
                  fields: schemaSubset,
                  global: global
                },
                req
              )
            });
          });
        }
      });

      self._app.all(self._action + '/confirm/:code', function(req, res) {
        var reset;
        var person;
        return async.series({
          validate: function(callback) {
            confirm = self._apos.sanitizeString(req.params.code);
            if (!confirm) {
              return callback('unconfirmed');
            }
            return callback(null);
          },
          get: function(callback) {
            return self._apos.pages.findOne({ applyConfirm: confirm }, function(err, _person) {
              if (err) {
                return callback(err);
              }
              person = _person;
              return callback(null);
            });
          },
          confirm: function(callback) {
            return self._apos.pages.update({ type: 'person', applyConfirm: confirm, login: { $ne: true } }, { $set: { login: true }, $unset: { applyConfirm: 1 } }, function(err, count) {
              if (err) {
                return callback(err);
              }
              if (!count) {
                return callback('unconfirmed');
              }
              return callback(null);
            });
          },
          emit: function(callback) {
            self._apos.emit('signupConfirmed', person);
            return setImmediate(callback);
          },
          loginOnConfirm: function(callback) {
            if (self.options.loginOnConfirm) {
              person.login = true;
              return async.series({
                // Apply the same logic we would apply to a normal login
                beforeSignin: function(callback) {
                  return self._apos.appyBeforeSignin(person, callback);
                },
                login: function(callback) {
                  return req.login(person, callback);
                }
              }, callback);
            }
            return setImmediate(callback);
          }
        }, function(err) {
          if (err) {
            console.error(err);
          }
          return res.send(self.renderPage(req, err ? err : 'confirmed', { message: err, reset: reset }));
        });
      });
    }

    // This is a route that returns a thumbnail for a given user.
    // The query can either contain a 'username' or an 'id' which
    // will be used to fetch the appropriate user. Optionally, if
    // you're using another name for the 'thumbnail' field on your
    // person snippet, you can pass in 'fieldname' as part of the query
    // and it will find the appropriate field.

    self._app.get(self._action + '/thumbnail', function(req, res) {
      var thumbnailUrl;
      var id;
      var username;
      var fieldname;

      return async.series({
        validate: function(callback) {
          // We want to be able to use either username or id.
          // So check for numberness to determine which it is.
          if (req.query.username){
            username = self._apos.sanitizeString(req.query.username);
          } else if (req.query.id){
            id = self._apos.sanitizeString(req.query.id);
          }

          fieldname = (req.query.fieldname ? req.query.fieldname : 'thumbnail');

          if (!id && !username) {
            return callback('unconfirmed');
          }
          return callback(null);
        },
        getPerson: function(callback) {
          var criteria = {};
          if (!!id) {
            criteria = { _id: id};
          } else if (!!username){
            criteria = { username: username};
          }
          return self.get(req, criteria, {}, function(err, results) {
            if (err) {
              return callback(err);
            }
            if (!results || results.total < 1) {
              return callback('No people found.');
            }

            var person = results.snippets[0];
            if(!self._apos._aposLocals.aposSingletonIsEmpty(person, fieldname, 'slideshow')){
              thumbnailUrl = self._apos._aposLocals.aposAreaImagePath(person, fieldname, {size: 'one-sixth'});
            }
            return callback(null);
          });
        },
      }, function(err) {
        return res.json(thumbnailUrl);
      });
    });
  }

  // Call the base class constructor. Don't pass the callback, we want to invoke it
  // ourselves after constructing more stuff
  snippets.Snippets.call(this, options, null);

  self._apos.mixinModuleEmail(self);
  // for bc
  self.mail = self.email;

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

    if ((!options.sort) && (!options.search) && (!options.q)) {
      options.sort = { sortLastName: 1, sortFirstName: 1 };
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
        // Let the groups permalink to their own best directory pages.
        // Apply the "if only one" rule to joins defined on groups
        // themselves. This way the "show" page for a person can
        // see items joined to its groups, but they do not slow
        // down index views.
        return self._apos.joinByArray(req, results.snippets, 'groupIds', undefined, '_groups', { get: self.getGroupsManager().get, getOptions: { getPeople: false, withJoins: (results.snippets.length > 1) ? false : undefined, permalink: true } }, function(err) {
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
    snippet.url = self._apos.slugToUrl(page.slug + '/' + snippet.slug);
    return callback(null);
  };

  self.beforeSave = function(req, data, snippet, callback) {

    // Leading _ is a mnemonic reminding me to NOT store plaintext passwords directly!
    var _password = self._apos.sanitizeString(data.password, null);

    if ((!snippet.password) || (_password !== null)) {
      if (_password === null) {
        _password = self._apos.generateId();
      }
      snippet.password = self.hashPassword(_password);
    }

    return callback(null);
  };

  self.beforeTrash = function(req, snippet, trash, callback) {
    if (trash) return callback(null);

    async.series({
      uniqueEmail: function(callback) {
        self._apos.pages.findOne({
          type: self._instance,
          email: self._apos.emailMatch(snippet.email),
          trash: {$ne: true},
          _id: { $ne: snippet._id }
        }, function(err, existing) {
          if (err) {
            return callback(err);
          }
          if (existing) {
            console.log("Email is duplicate, removing field");
            return self._apos.pages.update({ slug: snippet.slug }, {$unset: {email: ""}}, callback);
          }
          return callback(null);
        });
      },
      uniqueUsername: function(callback) {
        self._apos.pages.findOne({
          type: self._instance,
          username: snippet.username,
          trash: {$ne: true},
          _id: { $ne: snippet._id }
        }, function(err, existing) {
          if (err) {
            return callback(err);
          }
          if (existing) {
            console.log("Username is duplicate, removing field");
            return self._apos.pages.update({ slug: snippet.slug }, {$unset: {username: ""}}, callback);
          }
          return callback(null);
        });
      }
    }, function(err) {
      return callback(err);
    });
  }

  // Make sure the email address and username are unique. (This is not
  // proof against race conditions but these will be very rare and do not
  // affect existing users, just two newcomers signing up at the same
  // millisecond.) TODO: think harder about accommodating unique indexes
  // in a collection of heterogenous documents like people, pages, blog posts etc.
  //
  // Also supplies title if it is missing and first or last name is set.

  self.beforePutOne = function(req, slug, options, snippet, callback) {
    if ((!snippet.title) && (snippet.firstName || snippet.lastName)) {
      snippet.title = snippet.firstName + ' ' + snippet.lastName;
    }
    snippet.sortFirstName = snippet.firstName ? self._apos.sortify(snippet.firstName) : null;
    snippet.sortLastName = snippet.lastName ? self._apos.sortify(snippet.lastName) : null;
    return async.series({
      uniqueEmail: function(callback) {
        if (!snippet.email) {
          // Email is sparsely unique - it's OK to have no email address
          // at all, but if you have one it must be unique
          return callback(null);
        }
        return self._apos.pages.findOne({
          type: self._instance,
          email: self._apos.emailMatch(snippet.email),
          trash: {$ne: true},
          _id: { $ne: snippet._id }
        }, function(err, existing) {
          if (err) {
            return callback(err);
          }
          if (existing) {
            return callback('duplicateEmail');
          }
          return callback(null);
        });
      },
      uniqueUsername: function(callback) {
        if (!snippet.username) {
          // People are allowed to have no username at all, but
          // canonicalize it to not being present as a property at all
          delete snippet.username;
          return callback(null);
        }
        return self._apos.pages.findOne({
          type: self._instance,
          username: snippet.username,
          trash: {$ne: true},
          _id: { $ne: snippet._id }
        }, function(err, existing) {
          if (err) {
            return callback(err);
          }
          if (existing) {
            return callback({ message: 'Duplicate Username' });
          }
          return callback(null);
        });
      }
    }, callback);
  };

  // Hash a password for storage in mongodb.
  // The password-hash npm module generates a lovely string formatted:
  //
  // algorithmname:salt:hash
  //
  // With a newly generated salt.

  self.hashPassword = function(password) {
    return self._apos.hashPassword(password);
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

  // As it turns out we pretty much hate this whole thing, so provide
  // a simplePages option to use the standard "best page" algorithm,
  // which will find pages of type people. -Tom

  var superFindBestPage = self.findBestPage;

  self.findBestPage = function(req, snippet, callback) {

    if (self.options.simplePages) {
      return superFindBestPage(req, snippet, callback);
    }

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
      return self.getGroupsManager().getOne(req, { _id: { $in: snippet.groupIds || [] } }, self.getOptionsForGetFirstGroup(), function(err, groupArg) {
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

  // When fetching a person's first group in order to figure out the best index page,
  // the default behavior is now to fetch it without recursively joining back to
  // people or carrying out any other joins, in order to prevent an infinite recursion.
  // However you can tweak this behavior by overriding this method

  self.getOptionsForGetFirstGroup = function() {
    return {
      withJoins: false,
      getPeople: false
    };
  };

  var superDispatch = self.dispatch;
  self.dispatch = function(req, callback) {
    return superDispatch.call(this, req, callback);
  };

  var superImportCreateItem = self.importCreateItem;
  self.importCreateItem = function(req, data, callback) {
    if (!data.title) {
      data.title = data.firstName + ' ' + data.lastName;
    }
    return superImportCreateItem(req, data, callback);
  };

  // Allow group memberships to be imported by name. TODO: this is
  // a bit inefficient, we should cache the group IDs. Better yet,
  // we should reconcile our group/person relationships with
  // modern A2 joins, which can be imported out of the box.

  if (self.manager) {
    var superPushAllAssets = self.pushAllAssets;
    self.pushAllAssets = function() {
      superPushAllAssets();
      if (options.apply) {
        // Construct our browser side object
        var browserOptions = options.apply.browser || {};

        // The option can't be .constructor because that has a special meaning
        // in a javascript object (not the one you'd expect, either) http://stackoverflow.com/questions/4012998/what-it-the-significance-of-the-javascript-constructor-property
        var browser = {
          construct: browserOptions.construct || 'AposPeopleApply'
        };

        self._apos.pushGlobalCallWhen('always', 'window.aposPeopleApply = new @(?)', browser.construct, { action: self._action });
        self.pushAsset('script', 'apply', { when: 'always' });
        self.pushAsset('template', 'loginOrApply', { when: 'always' });
      }
      self.pushAsset('template', 'passwordEditor', { when: 'user' });
    };
  }

  if (callback) {
    // Invoke callback on next tick so that the people object
    // is returned first and can be assigned to a variable for
    // use in whatever our callback is invoking
    process.nextTick(function() { return callback(null); });
  }
};
