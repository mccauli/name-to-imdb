var async = require("async");
var namedQueue = require("named-queue");
var qs = require("querystring");
var _ = require("lodash");
var needle = require("needle");

var GOOGLE_AJAX_API = "http://ajax.googleapis.com/ajax/services/search/web?v=1.0&rsz=large&q=";
var GOOGLE_SEARCH = "https://www.google.com/search?safe=off&site=&source=hp&q=";

// Utility to reduce the name to it's most basic form
function simplifyName(n) {
  if (!n) return n;
  return n.toLowerCase()
    .trim()
    .replace(/\([^\(]+\)$/, "") // remove brackets at end
    .replace(/&/g, "and") // unify & vs "and"
    .replace(/[^0-9a-z ]+/g, " ") // remove any special characters
    .split(" ").filter(function(r){ return r }).join(" ") // remove any aditional whitespaces
};

// Find in our metadata set
var pulled = { movie: false, series: false };
var meta = { }, byImdb = { };

// Find in the web / Google
function webFind(task, cb) {
  var opts = {
    follow_max: 3,
    open_timeout: 15*1000,
    proxy: task.proxy,
    headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.86 Safari/537.36" }
  };

  if (task.hintUrl) return needle.get(task.hintUrl, opts, function(err, resp, body) {
    if (err) return cb(err);
    var match = body && body.match(new RegExp("\/title\/(tt[0-9]+)")) || body.match(new RegExp("\/name\/(nm[0-9]+)")); // Match IMDB Id from the whole body
    var id = match && match[1];
    cb(null, id, { match: task.hintUrl });
  });

  // WARNING: www. vs not?  is there difference?
  // no quotes - they can actually make the results dumber
  var query = "site:imdb.com "
    +task.name.toLowerCase()+(task.year ? " "+task.year : "")
    +(task.director ? " "+task.director : "")
    +((task.type=="series") ? " \"tv series\"" : ""); // Compute that now so that we can use the mapping

  // Google search api is deprecated, use this
  webFind({ hintUrl: GOOGLE_SEARCH+encodeURIComponent(query) }, cb);
}

// In-memory cache for matched items, to avoid flooding Google (or whatever search api we use)
var cache = { };

// Outside API
function nameToImdb(args, cb) {
  args = typeof(args)=="string" ? { name: args } : args;

  var q = _.pick(args, "name", "year", "type", "director");
  q.name = simplifyName(q.name);

  if (! q.name) return cb(new Error("empty name"));

  if (q.year && typeof(q.year)=="string") q.year = parseInt(q.year.split("-")[0]);
  if (q.year && isNaN(q.year)) return cb(new Error("invalid year"));

  if (q.type && !(q.type=="movie" || q.type=="series" || q.type=="person")) return cb(null, null); // no match for other types

  var hash = new Buffer(args.hintUrl || _.values(q).join(":")).toString("ascii"); // convert to ASCII since EventEmitter bugs with UTF8
  if (cache.hasOwnProperty(hash)) return cb(null, cache[hash]);

  queue.push({ id: hash, q: q, args: args }, function(err, imdb_id, match) {
    if (err) return cb(err);
    if (imdb_id) {
      cache[hash] = imdb_id;
    }
    cb(null, imdb_id, match);
  });
};

var queue = new namedQueue(function(task, cb) {
  webFind(task.args, cb);
}, 3);


module.exports = nameToImdb;
module.exports.byImdb = byImdb;
