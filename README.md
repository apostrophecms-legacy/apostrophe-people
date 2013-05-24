# apostrophe-people

`apostrophe-people` adds staff directories, user accounts and user profiles to the [Apostrophe](http://github.com/punkave/apostrophe) content management system. `apostrophe-people` provides both backend and frontend components, including a friendly UI built on Apostrophe's rich content editing features.

A "person" is anyone who can either log in, be seen in a personnel directory, or both. "Users" are simply people who have the "login" box checked and a username and password configured. This follows the MongoDB philosophy of avoiding gratuitous joins between users, profiles, etc.

People can be centrally managed via the "People" dropdown. In addition, one can create a "people page" to display a directory of people. For now people are displayed on such pages based on shared tags, however we plan to also give each user an affinity for a specific "home" page allowing for easier management of users.
