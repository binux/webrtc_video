// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-22 17:20:48

define(['underscore', 'peer'], function(__, peer) {
  function Client() {
    this.peerid = null;
    this.file_meta = null;
    this.peers = {};
    this.ws = new WebSocket(
      (location.protocol == 'https:' ? 'wss://' : 'ws://')+location.host+'/room/ws');
    this.ws.onopen = _.bind(this.onwsopen, this);
    this.ws.onmessage = _.bind(this.onwsmessage, this);
    this.ready = false;
  }

  Client.prototype = {
    init: function() {
    },

    new_room: function(file_meta) {
      this.ws.send(JSON.stringify({cmd: 'new_room', file_meta: file_meta}));
      this.file_meta = file_meta;
    },

    join_room: function(room_id) {
      this.ws.send(JSON.stringify({cmd: 'join_room', roomid: room_id}));
    },

    update_peer_list: function() {
      this.ws.send(JSON.stringify({cmd: 'get_peer_list'}));
    },

    ensure_connection: function(peerid) {
      if (this.peers[peerid]) {
        return this.peers[peerid];
      } else {
        this.peers[peerid] = new peer.Peer(this.ws, this.peerid, peerid);
        return this.peers[peerid];
      }
    },

    onwsopen: function() { },

    onwsmessage: function(evt) {
      var msg = JSON.parse(evt.data);

      if (!msg.cmd && msg.type && msg.origin) {
        var peer = this.ensure_connection(msg.origin);
        peer.onwsmessage(msg);
      } else if (msg.cmd) {
        console.debug('p2p:', msg);
        switch (msg.cmd) {
          case 'peerid':
            this.ready = true;
            if (_.isFunction(this.onready)) {
              this.onready();
            }
            this.peerid = msg.peerid;
            break;
          case 'file_meta':
            this.file_meta = msg.file_meta;
            break;
          case 'peer_list':
            this.peer_list = msg.peer_list;
            break;
          default:
            break;
        }
      }
    }
  };

  return {
    Client: Client
  };
});
