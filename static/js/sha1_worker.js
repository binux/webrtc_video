// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-20 20:55:07

importScripts('/static/js/lib/sha1.js');

self.onmessage = function(evt) {
  var data = evt.data;
  var req = new XMLHttpRequest();
  req.open('GET', data.blob, false);
  req.send(null);
  self.postMessage({id: data.id, hash: CryptoJS.SHA1(req.response).toString(), blob: data.blob});
  req.response = null;
};
