// node24-win-readlink-shim.cjs
// Node 24 on Windows regressed fs.readlink: for non-symlink targets (both
// regular files AND directories) libuv now returns EISDIR/ENOENT variants
// instead of EINVAL. Webpack's enhanced-resolve + PackFileCacheStrategy
// catch EINVAL as "not a symlink, move on" but let EISDIR escape, crashing
// builds with "EISDIR: illegal operation on a directory, readlink <path>"
// on rotating metadata files.
//
// This shim translates EISDIR → EINVAL for readlink/readlinkSync/promises
// whenever the target is NOT actually a symlink (verified via lstat +
// GetFinalPathName heuristics). Loaded via NODE_OPTIONS="--require <abs>"
// for the build only.

'use strict';

const fs = require('fs');

function isActuallySymlink(path) {
  try {
    return fs.lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function makeEINVAL(path) {
  const translated = new Error(`EINVAL: invalid argument, readlink '${path}'`);
  translated.code = 'EINVAL';
  translated.errno = -4071;
  translated.syscall = 'readlink';
  translated.path = path;
  return translated;
}

const origReadlink = fs.readlink;
fs.readlink = function patchedReadlink(path, options, callback) {
  let cb = callback;
  let opts = options;
  if (typeof options === 'function') {
    cb = options;
    opts = undefined;
  }
  return origReadlink.call(fs, path, opts, (err, linkString) => {
    if (err && err.code === 'EISDIR' && !isActuallySymlink(path)) {
      cb && cb(makeEINVAL(path));
      return;
    }
    cb && cb(err, linkString);
  });
};

const origReadlinkSync = fs.readlinkSync;
fs.readlinkSync = function patchedReadlinkSync(path, options) {
  try {
    return origReadlinkSync.call(fs, path, options);
  } catch (err) {
    if (err && err.code === 'EISDIR' && !isActuallySymlink(path)) {
      throw makeEINVAL(path);
    }
    throw err;
  }
};

const origReadlinkPromise = fs.promises.readlink;
fs.promises.readlink = async function patchedReadlinkPromise(path, options) {
  try {
    return await origReadlinkPromise.call(fs.promises, path, options);
  } catch (err) {
    if (err && err.code === 'EISDIR' && !isActuallySymlink(path)) {
      throw makeEINVAL(path);
    }
    throw err;
  }
};
