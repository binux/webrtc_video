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

    this.init();
  }

  HttpPeer.prototype = {
    init: function() {
      this._sended = 0;
      this._recved = 0;
      this.reqs = {};
      this.reqs_loaded = {};
    },

    send: function (obj) {
      if (obj.cmd == 'request_block') {
        var start = this.client.file_meta.piece_size*obj.piece+
          this.client.file_meta.block_size*obj.block;
        var end = start+this.client.file_meta.block_size;
        var req_id = _.uniqueId('xhr_');
        var req = new XMLHttpRequest();
        
        this.reqs[req_id] = req;

        req.open('GET', this.url, true);
        req.setRequestHeader('Range', 'bytes='+start+'-'+(end-1));
        req.responseType = 'arraybuffer';

        var This = this;
        var start_time = (new Date()).getTime();
        req.addEventListener('load', function(evt) {
          if (200 <= req.status && req.status < 300) {
            var data = new Uint8Array(req.response);
            if (_.isFunction(This.onmessage)) {
              This.onmessage({cmd: 'block', piece: obj.piece, block: obj.block, data: data});
            }

            // remove req
            This.reqs[req_id] = null;
            delete This.reqs[req_id];
            This.reqs_loaded[req_id] = 0;
            delete This.reqs_loaded[req_id];
            This._recved += data.byteLength;
          } else {
            This.close();
          }
        });
        req.addEventListener('progress', function(evt) {
          This.reqs_loaded[req_id] = evt.loaded;
        });
        req.addEventListener('error', function() {
          This.close();
        });

        req.send();
      }
    },

    sended: function() {
      return 0;
    },

    recved: function() {
      return this._recved+
        _.reduce(_.values(this.reqs_loaded), function(memo, num){ return memo + num; }, 0);
    },

    close: function() {
      _.each(_.values(this.reqs), function(req) {
        if (req)
          req.abort();
      });
      this.reqs = {};
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
