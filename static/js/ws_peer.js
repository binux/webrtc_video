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

    this.sended = 0;
    this.recved = 0;
    
    this.init();
  }

  WebSocketPeer.prototype = {
    init: function() {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = _.bind(function() {
        this.ready = true;
        if (_.isFunction(this.onready)) {
          this.onready();
        }
      }, this);
      this.ws.onmessage = _.bind(function(evt) {
        var reader = new FileReader();
        var This = this;
        reader.onload = function(evt) {
          var data = evt.target.result;
          var piece_block = data.slice(0, data.indexOf('|')).split(',');
          data = data.slice(data.indexOf('|')+1);

          This.onmessage(JSON.stringify({cmd: 'block', piece: parseInt(piece_block[0], 10),
                         block: parseInt(piece_block[1], 10), data: data}));
        };
        reader.readAsBinaryString(evt.data);
        
        this.recved += evt.data.size;
        if (_.isFunction(this.onspeedreport)) {
          this.onspeedreport({send: 0, sended: this.sended, recv: 0, recved: this.recved});
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
          this.sended += data.length;
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
