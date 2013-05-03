// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-05-03 10:31:31
// !!NOT RECOMMENDED!! really poor performance

define(['underscore'], function() {
  // HTTP Peer adapter for p2p.js
  function HttpPeer(url, client) {
    this.id = url;
    this.url = url;
    this.client = client;
    this.recved = 0;
  }

  HttpPeer.prototype = {
    send: function (obj) {
      if (obj.cmd == 'request_block') {
        var start = this.client.file_meta.piece_size*obj.piece+
          this.client.file_meta.block_size*obj.block;
        var req = new XMLHttpRequest();
        req.open('GET', this.url, true);
        req.setRequestHeader('Range', 'bytes='+start+'-'+(start+this.client.file_meta.block_size-1));
        req.responseType = 'arraybuffer';

        var This = this;
        var start_time = (new Date()).getTime();
        req.addEventListener('load', function(evt) {
          if (200 <= req.status && req.status < 300) {
            var data = new Uint8Array(req.response);
            This.recved += data.byteLength;
            if (_.isFunction(This.onmessage)) {
              This.onmessage({cmd: 'block', piece: obj.piece, block: obj.block, data: data});
            }
          } else {
            This.close();
          }
        });
        req.addEventListener('progress', function(evt) {
          if (evt.lengthComputable) {
            if (_.isFunction(This.onspeedreport)) {
              This.onspeedreport({send: 0, sended: 0,
                                  recv: evt.loaded / ((new Date()).getTime() - start_time) * 1000,
                                  recved: This.recved+evt.loaded
              });
            }
          }
        });
        req.addEventListener('error', function() {
          This.close();
        });

        req.send();
      }
    },

    close: function() {
      if (this.onclose) {
        this.onclose();
      }
    },

    connect: function() { },
    listen: function() { },
    onwsmessage: function() { },
    onready: function() { },
    onclose: function() { },
    onmessage: function() { }
  };

  return {
    Peer: HttpPeer
  };
});
