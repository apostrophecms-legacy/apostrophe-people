# apostrophe-people

`apostrophe-people`, together with `apostrophe-groups`, adds staff directories, user accounts and user profiles to the [Apostrophe](http://github.com/punkave/apostrophe) content management system.

A "person" is anyone who can either log in, be seen in a personnel directory, or both. "Users" are simply people who have the "login" box checked and a username and password configured. This follows the MongoDB philosophy of avoiding gratuitous joins between users, profiles, etc.

People can be centrally managed via the "People" dropdown, and groups of people created via the "Groups" dropdown.

In addition, one can create a "directory page" to display a directory of people. For now people are displayed on such pages based on shared tags, however we plan to also give each user an affinity for a specific "home" page allowing for easier management of users.

See the a2 sandbox for a functional example.

## You Also Need Groups

You'll want to install both the people module and the [groups module](http://github.com/punkave/apostrophe-groups) to use this functionality successfully. Again, see the [a2 sandbox](http://github.com/punkave/apostrophe-sandbox) for a working example.

## The Directory Page

The directory page presents a directory of groups, which commonly represent departments within an organization. Only groups which are published are shown here.

When a site visitor clicks on a group, they are then shown a list of people in that group. Only people who have the "published" selector set to "Yes" are shown here.

TODO: provide an option to skip straight to a list of people throughout the organization, and make it easy for that to be the default behavior, as on many sites a public list of groups is overkill or secondary to the main alphabetical list of staff members.

## Subclassing and Overriding the Directory Page

The directory page is implemented by the `apostrophe-groups` module. You'll want to subclass that module, overriding the `index.html` template and perhaps extending or overriding the `show` and `isShow` methods, or overriding the `dispatch` method entirely, as your needs dictate. Currently the people module is able to use the dispatch method of the snippets module without modification for the main list of gropus. This will likely change soon when we introduce ways to skip directly to a list of all people in the organization.

This is similar to the way the `apostrophe-events` module subclasses and overrides portions of the `apostrophe-snippets` module.

## About Permissions

People receive basic permissions such as "guest," "edit" and "admin" via groups that have been given those permissions.

### Permission to View Content

People who are members of groups for which the "Admin" box has been checked can always view everything, whether it is published or not.

People who are members of groups for which the "Guest" or "Editor" box hs been checked has been checked can potentially view additional content:

* Guests and editors can view any page for which "Login Required" has been chosen from the "who can view this?" section of "Page Settings."

* Guests and editors are candidates to view pages for which "Certain People" has been chosen from the "who can view this?" section of "Page Settings." An admin must grant them that permission as an individual or as a group after selecting "Certain People."

* In addition, editors can always view content they have permission to edit, as described below.

### Permission to Edit Content

Similarly, people who are members of groups for which the "Editor" box is checked become candidates to edit pages. Someone with admin permissions can then click "Who can edit this?" under "Page Settings" and enter that person or group's name to add them to the list of editors for that particular page.

Those with editing permissions can also create and edit their own blog posts, events and so forth (but not people or groups). They cannot edit blog posts and events created by others (TODO: allow permissions to be granted for this in the same way edit permissions for pages are granted).

### Admin Permissions

Only people who are members of groups for which the "Admin" box is checked, and any hard-coded admin users in `app.js`, are permitted to carry out admin actions such as:

* Adding people
* Adding groups
* Changing and edit and view permissions.

### Sorting People Manually Within A Group

Many organizations have their own way of ranking people within groups or departments that must be maintained. By default, the members of a group are displayed alphabetically. However, you can switch to manual ordering by passing a simple option when initializing the groups module. Here's an example from `app.js`:

    function initAposGroups(callback) {
      groups = require('apostrophe-groups')({
        ... other options ...
        peopleSortable: true
      }, ... etc ...);
    }

Once you enable this option, you will be able to drag and drop people to reorder them in the list of persons that are members of each group.

### Password Reset

Users may reset their password via email confirmation, as long as they have a valid email address and a link to "/apos-people/reset-request" is present in the `login.html` template, which is true in current versions of the sandbox.

However for those emails to be delivered you will need to set a valid "from" address when configuring the people module. Its options must include:

```javascript
    {
      email: {
        from: "Some Person <someone@somewhere.com>"
      }
    }
```

There is a default "from" address but sendmail will complain that it is not valid and users will see an error. So make sure you configure that.

### Profiles

All users who belong to a group with at least "guest" access may edit their profile as long as you include the relevant markup in `outerLayout.html` (see the sandbox for an example).

You may choose the fields that are editable by the end user via the `profileFields` option. The first name, last name, and title fields are independent of the schema, but if you do not present them in the form they will not be overwritten when the profile is saved. You can customize the form by copying `profileEditor.html` from the people module to `lib/modules/apostrophe-people/profileEditor.html`.

By default, the fields will remain in their usual tab groups within the profile editor, although any empty tabs will be discarded. If you wish to specify a different grouping, use the `profileGroupFields` option, which works exactly like `groupFields`.

### Applying For Accounts

People may apply for accounts with login privileges if you set the `apply` option to `true` when configuring the `apostrophe-people` module.

The `applyFields` option determines the fields that people are invited to fill out when they apply for an account. The following list is the default, and you should specify at least these fields. You may specify additional fields that exist in your schema (see `addFields`).

```javascript
[ 'username', 'password', 'firstName', 'lastName', 'title', 'email' ]
```

The above fields are required and the user will not be permitted to complete the application form without supplying them.

The `apply.html` template is used to present the application form.

#### Triggering the Application Form

You can trigger the application form by giving any link a
`data-people-apply` attribute. You can place those wherever it makes
sense in your application:

    <a href="#" data-people-apply>Sign Up For An Account</a>

By default the user is required to confirm their account by clicking
on a link in an email generated when they complete the form.

### Account Confirmation

Confirmation emails are generated via the `applyEmail.html` and `applyEmail.txt` templates. The subject lines can be overridden via the `applySubject` option.

If you don't mind a higher rate of spam accounts, you may opt out of
email confirmation with:

    applyConfirm: false

### Permissions for New Accounts

When users create accounts, by default they are added to a group
called "Guests" with the single permission "guest". This account is
created if it does not yet exist. If it does already exist, its
permissions are left as-is.

You may change the group name:

    applyGroup: guitarists

Or the group's permissions:

    applyGroupPermissions: [ 'guest', 'submit-event', 'submit-blog-post' ]

### Fine-Grained Permissions For Events, Blog Posts and Other Types

Fine-grained permissions are now available on a per-group basis for
events, blog posts and so on; in fact, any new snippet instance type
you define will automatically have three permissions available to be
assigned to groups:

`submit-blog-post`: can submit a blog post but cannot mark it published
`edit-blog-post`: can submit blog posts and publish them, but not edit
other people's
`admin-blog-post`: can edit, publish and remove any blog post

This is very helpful to cut down on confusion that stems from giving
too many people the admin permission.

The "edit" permission implies all "edit-*" permissions, and the
"admin" permission implies all "admin-*" permissions.

### Requiring Users To Log In *Or* Sign In

You can also set up links that give the user a choice between creating
an account and logging into an existing account. And you can set a URL
to be accessed when the user has finished logging in, one way or the
other, via the data-after-login attribute:

    <a href="#" data-people-login-or-apply data-after-login="/">Log in
first, then go home</a>

### Triggering Button Clicks After The User Logs In

Of course, sometimes what you really want is to force the user to log
in or sign up, then trigger something that would normally be accessed
by just clicking a button on a particular page.

So we've added a way to trigger a click event on an element in a page
after loading it. (This is actually a core Apostrophe module feature but it has special relevance here.)

Just end any URL with this:

    #click-my-button

And Apostrophe will look for an element with a `data-my-button`
attribute and trigger a click event on it after loading the relevant page with an extra URL component to prevent caching.

*my-button is just an example. Use your own attribute name.*

Apostrophe will also scroll to ensure that element is visible.

This feature works well with the "data-after-login" attribute shown above.

### Using Account Signups With apostrophe-moderator

You may want to mix this feature with the [apostrophe-moderator](http://github.com/punkave/apostrophe-moderator) module, which allows for easy management of user-submitted content. If so, make sure you add the appropriate permissions for the types that will support moderation, like this:

    applyGroupPermissions: [ 'guest', 'submit-event', 'submit-blog-post' ]

Note the use of hyphenated names.

Now users who create accounts via the online application process will be able to immediately begin submitting and editing their own content, but will *not* be able to mark it as "published," and if you use the moderator module there will be an easy way for admins to filter and view the submitted content.

### Extra Fields: How Job Titles Work

You'll notice that, by default, you're prompted for a job title for each person you add to the group. This information is accessible in templates this way:

```javascript
person.groupExtras[groupId].jobTitle
```

If you don't want this feature, you can disable it with the `peopleExtras` option when configuring the `apostrophe-groups` module:

```javascript
peopleExtras: false
```

You can also specify an array of extra fields, replacing the usual job title field. The syntax is a subset of that supported by Apostrophe schemas. We recommend sticking to simple `string` and `select` field types here.

**The relationship between people and groups is currently not an A2 join in the usual sense.** We're not crazy about that, and we may migrate to using standard A2 joins and relationships in the future.

### Taking action when a new account is confirmed or created

You may wish to take special action when a user has confirmed their account, or if you are not using the `applyConfirm` feature, when their account is first created.

You can do so by listening for the `signupConfirmed` event:

```javascript
apos.on('signupConfirmed', function(person) {
  // do as you see fit with this person
});
```

For instance you might use this feature to implement an additional level of confirmation by the administrator before manually adding the user to a privileged group.

### An Alternative to the "Directory" Pages

If you are never interested in displaying a directory that nests people hierarchically within groups, and simply wish to display a directory of all of the people on the site, optionally filtered by tag, consider using the `simplePages: true` option. When this flag is in effect, a page of type `people` behaves just like any snippet index page.
