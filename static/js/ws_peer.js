// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-05-03 16:41:36

define(['underscore'], function() {
  function WebSocketPeer(url, client) {
    this.id = url;
    this.url = url;
    this.client = client;
    
    this.init();
  }

  WebSocketPeer.prototype = {
    init: function() {
      this.ws = null;
      this.ready = false;

      this._sended = 0;
      this._recved = 0;

      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = _.bind(function() {
        this.ready = true;
        if (_.isFunction(this.onready)) {
          this.onready();
        }
      }, this);
      this.ws.onmessage = _.bind(this._onwsmessage, this);
      this.ws.onclose = _.bind(function() {
        this.close();
      }, this);
    },

    _onwsmessage: function(evt) {
      this._recved += evt.data.byteLength || evt.data.length || 0;
      
      if (evt.data.length) {
        var msg = JSON.parse(evt.data);
        if (msg.cmd == 'start') {
          this.array = [];
        } else if (msg.cmd == 'end') {
          var length = 0;
          _.each(this.array, function(a) { length += a.byteLength; });
          var data = new Uint8Array(length);
          var pos = 0;
          _.each(this.array, function(a) { data.set(a, pos); pos += a.byteLength; });
          if (_.isFunction(this.onmessage)) {
            this.onmessage({cmd: 'block', piece: msg.piece, block: msg.block, data: data});
          }
          this.array = [];
        }
      } else {
        this.array.push(new Uint8Array(evt.data));
      }
    },

    send: function(obj) {
      if (!this.ws || !this.ready) {
        _.delay(_.bind(this.send, this), 2000, obj);
      } else {
        if (obj.cmd == 'request_block') {
          var start = this.client.file_meta.piece_size*obj.piece+
            this.client.file_meta.block_size*obj.block;
          var end = start + this.client.file_meta.block_size;
          var data = JSON.stringify({start: start, end: end, piece: obj.piece, block: obj.block});
          this.ws.send(data);

          this._sended += data.length;
        }
      }
    },

    sended: function() { return this._sended; },

    recved: function() { return this._recved; },

    close: function() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      if (_.isFunction(this.onclose)) {
        this.closeonce = this.closeonce || _.once(this.onclose);
        this.closeonce();
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
    Peer: WebSocketPeer
  };
});
