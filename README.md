# apostrophe-people

`apostrophe-people` adds staff directories, user accounts and user profiles to the [Apostrophe](http://github.com/punkave/apostrophe) content management system. `apostrophe-people` provides both backend and frontend components, including a friendly UI built on Apostrophe's rich content editing features.

A "person" is anyone who can either log in, be seen in a personnel directory, or both. "Users" are simply people who have the "login" box checked and a username and password configured. This follows the MongoDB philosophy of avoiding gratuitous joins between users, profiles, etc.

People can be centrally managed via the "People" dropdown. In addition, one can create a "people page" to display a directory of people. People can be added and managed from such pages, in which case they will always appear there. This provides a simple and intuitive way to manage the "staff" on one page, the "contributors" on another, and so on. However, one can also configure a "people" page to display people based on tags and to include people from different home pages.
