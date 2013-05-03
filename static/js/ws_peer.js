// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-05-03 16:41:36

define(['underscore'], function() {
  function WebSocketPeer(url, client) {
    this.id = url;
    this.url = url;
    this.client = client;
    this.ws = null;
    this.ready = false;

    this.pending = 0;
    this.start_time = 0;
    this.send_in_pending = 0;
    this.recv_in_pending = 0;
    this.sended = 0;
    this.recved = 0;
    
    this.init();
  }

  WebSocketPeer.prototype = {
    init: function() {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = _.bind(function() {
        this.ready = true;
        if (_.isFunction(this.onready)) {
          this.onready();
        }
      }, this);
      this.ws.onmessage = _.bind(function(evt) {
        var data = new Uint8Array(evt.data);
        for (var i=0; i<data.length; i++) {
          if (data[i] == 124) break; // '|'
        }
        var piece_block = '';
        for (var j=0; j<i; j++) {
          piece_block += String.fromCharCode(data[j]);
        }
        piece_block = piece_block.split(',');
        data = new Uint8Array(data.buffer.slice(i+1));
        if (_.isFunction(this.onmessage)) {
          this.onmessage({cmd: 'block', piece: parseInt(piece_block[0], 10),
                          block: parseInt(piece_block[1], 10), data: data});
        }
        
        this.recv_in_pending += evt.data.byteLength;
        this.recved += evt.data.byteLength;
        this.pending -= 1;
        if (this.pending <= 0) {
          this.pending = 0;
          this.send_in_pending = 0;
          this.recv_in_pending = 0;
        }

        if (_.isFunction(this.onspeedreport)) {
          var past = (new Date()).getTime() - this.start_time;
          this.onspeedreport({send: this.send_in_pending / past * 1000, sended: this.sended,
                              recv: this.recv_in_pending / past * 1000, recved: this.recved});
        }
      }, this);
      this.ws.onclose = _.bind(function() {
        this.close();
      }, this);
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

          this.send_in_pending += data.length;
          this.sended += data.length;
          if (this.pending === 0) {
            this.start_time = (new Date()).getTime();
          }
          this.pending += 1;
        }
      }
    },

    close: function() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
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
    Peer: WebSocketPeer
  };
});
