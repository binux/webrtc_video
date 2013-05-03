// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-05-03 10:31:31

define(['underscore'], function() {
  // HTTP Peer adapter for p2p.js
  function HttpPeer(url, client) {
    this.id = url;
    this.url = url;
    this.client = client;
    this.recved = 0;
    this.piece_cache = {}; // request hold piece instead of one
  }

  HttpPeer.prototype = {
    send: function(obj) {
      if (obj.cmd == 'request_block') {
        if (_.has(this.piece_cache, obj.piece)) {
          var offset = this.client.file_meta.block_size*obj.block;
          var data = this.piece_cache[obj.piece].slice(offset, this.client.file_meta.block_size+offset);
          this.onmessage(JSON.stringify({
            cmd: 'block',
            piece: obj.piece,
            block: obj.block,
            data: data
          }));
        } else {
          this._send(obj);
        }
      }
    },

    _send: function (obj) {
      if (obj.cmd == 'request_block') {
        var start = this.client.file_meta.piece_size*obj.piece;
        var req = new XMLHttpRequest();
        req.open('GET', this.url, true);
        req.setRequestHeader('Range', 'bytes='+start+'-'+(start+this.client.file_meta.piece_size-1));
        req.responseType = 'blob';

        var This = this;
        var start_time = (new Date()).getTime();
        req.addEventListener('load', function(evt) {
          if (200 <= req.status && req.status < 300) {
            var reader = new FileReader();
            reader.onload = function(evt) {
              var data = evt.target.result;
              This.piece_cache[obj.piece] = data;
              This.recved += data.length;
              _.defer(_.bind(This.send, This), obj);
            };
            reader.readAsBinaryString(req.response);
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
