// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-20 20:55:07

importScripts('/static/js/lib/sha1.js');

self.onmessage = function(evt) {
  var data = evt.data;
  self.postMessage({id: data.id, hash: CryptoJS.SHA1(data.data).toString()});
};
