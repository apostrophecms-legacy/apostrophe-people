var assert = require('assert');
var apostrophePeople = require('../index');
var apostrophe = require('apostrophe')();
var apostrophePages = require('apostrophe-pages');
var mongo = require('mongodb');
var express = require('express');
var request = require('request');

var app = express();
var pages;
var db;

/**
 * This will test all the initialization stuff.
 */
describe('Initializing', function() {

    /**
     * Database settings can be configured here.
     * You can see all available options at
     * https://github.com/mongodb/node-mongodb-native
     */
    it('Should initialize MongoDB', function(callback) {
        db = new mongo.Db('apostrophe-people-test',
            new mongo.Server('127.0.0.1', 27017, {}), {
                safe: true
            }
        );
        assert( !! db);
        db.open(function(err) {
            assert(!err);
            callback();
        });
    });

    it('Should initialize Apostrophe', function(callback) {
        apostrophe.init({
            db: db,
            app: app
        }, function(err) {
            assert(!err);
            return callback();
        });
    });

    it('Should initialize apostrophe-pages', function(callback) {
        pages = apostrophePages({
            apos: apostrophe,
            ui: false
        }, function(err) {
            assert(!err);
            callback();
        });
    });

    it('Should initialize apostrophe-people', function(callback) {
        people = apostrophePeople({
            apos: apostrophe,
            pages: pages,
            app: app
        }, function(err) {
            assert(!err);
            callback();
        });
    });

    /**
     * Change the port number if you want
     */
    it('Should initialize Express', function(callback) {
        app.listen(8080, function(err) {
            assert(!err);
            callback();
        });
    });

});

/**
 * Simple test to see if all have ben returned correctly
 */
describe('Testing main object integrity', function() {
    it('Should be an object', function() {
        assert(people instanceof Object);
    });

    it('#getAutocompleteTitle should exist', function() {
        assert(people.getAutocompleteTitle);
    });

    it('#getAutocompleteFields should exist', function() {
        assert(people.getAutocompleteFields);
    });

    it('#get should exist', function() {
        assert(people.get);
        assert(people.get instanceof Function);
    });

    it('#setGroups should exist', function() {
        assert(people.setGroups);
        assert(people.setGroups instanceof Function);
    });

    it('#permalink should exist', function() {
        assert(people.permalink);
        assert(people.permalink instanceof Function);
    });

    it('#beforeSave should exist', function() {
        assert(people.beforeSave);
        assert(people.beforeSave instanceof Function);
    });

    it('#addApiCriteria should exist', function() {
        assert(people.addApiCriteria);
        assert(people.addApiCriteria instanceof Function);
    });

    it('#findBestPage should exist', function() {
        assert(people.findBestPage);
        assert(people.findBestPage instanceof Function);
    });

    it('#dispatch should exist', function() {
        assert(people.dispatch);
        assert(people.dispatch instanceof Function);
    });
});

/**
 * Those are the main routes used by apostrophe-people.
 * You shold add new routes here if you modify this module.
 */
describe('Testing routes setup', function() {

    /**
     * TODO: Login in the app and do an authenticated request.
     */
    it('/username-unique should return notfound', function(callback) {
        request.post({
                url: 'http://localhost:8080/apos-people/username-unique'
            },
            function(err, res, body) {
                assert(body === "notfound");
                callback();
            });
    });

    /**
     * Change the port number if you want
     */
    it('/generate-password should return notfound', function(callback) {
        request.post({
                url: 'http://localhost:8080/apos-people/generate-password'
            },
            function(err, res, body) {
                assert(body === "notfound");
                callback();
            });
    });
});
