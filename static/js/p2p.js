// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-22 17:20:48

define(['underscore', 'peer'], function(__, peer) {
  var requestFileSystem;
  if (window.webkitRequestFileSystem) {
    requestFileSystem = window.webkitRequestFileSystem;
  } else {
  }

  function Client() {
    this.peerid = null;
    this.file_meta = null;
    this.file_system = null;
    this.file_entry = null;
    this.ws = null;
    this.peers = {};
    this.ready = false;
    this.min_speed_limit = 3000; // 3kb/s

    this.piece_queue = [];
    this.finished_piece = [];
    this.cur_piece = null;
    this.inuse_peer = {};
    this.blocked_peer = {};

    this.init();
  }

  Client.prototype = {
    init: function() {
      this.ws = new WebSocket(
        (location.protocol == 'https:' ? 'wss://' : 'ws://')+location.host+'/room/ws');
      this.ws.onopen = _.bind(this.onwsopen, this);
      this.ws.onmessage = _.bind(this.onwsmessage, this);

      requestFileSystem(window.TEMPORARY, 5*1024*1024*1024 /* 5G */, _.bind(this.oninitfs, this));
    },

    new_room: function(file_meta) {
      this.file_meta = file_meta;
      this.ws.send(JSON.stringify({cmd: 'new_room', file_meta: file_meta}));
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
        var p = new peer.Peer(this.ws, this.peerid, peerid);
        p.onclose = _.bind(function() {
          console.log('peer connect with '+peerid+' disconnected;');
          this.peers[peerid] = null;
          delete this.peers[peerid];
        }, this);
        p.onmessage = _.bind(function(data) {
          console.log(data);
          return ;
          var msg = JSON.parse(data);
          switch (msg.cmd) {
            case 'request_block':
              break;
            case 'block':
              if (msg.piece == this.cur_piece && this.pending_block[msg.block] == peerid) {
                this.pending_block[msg.block] = 0;
                this.finished_block[msg.block] = 1;
                this.block_chunks[msg.block] = msg.data;
                this.onblock_finished(msg.piece, msg.block);
              }
              break;
            default:
              break;
          } 
        }, this);
        this.peers[peerid] = p;
        return p;
      }
    },

    // private
    pickup_block: function() {
      if (_.isEmpty(this.poece_queue)) {
        if (_.isFunction(this.onfinished)) {
          this.onfinished();
        }
        return null;
      }

      var i, block_cnt = this.file_meta.piece_size / this.file_meta.block_size;
      if (!this.cur_piece) {
        this.cur_piece = this.piece_queue.pop();
        this.block_chunks = [];
        for (i=0; i<block_cnt; ++i) {
          this.finished_block[i] = 0;
          this.pending_block[i] = 0;
        }
      }

      for (i=0; i<block_cnt; ++i) {
        if (this.finished_block[i] || this.pending_block[i])
          continue;
        return [this.cur_piece, i];
      }

      if (_.every(this.finished_block, _.identity)) {
        this.cur_piece = null;
        return this.pickup_block();
      }
      return null;
    },

    find_available_peer: function(piece) {
      for (var key in this.peer_list) {
        if (this.peer_list[key]['bitmap'][piece] && !this.inuse_peer[key] && !this.blocked_peer[key])
          return key;
      }
      return null;
    },

    start_process: function() {
      var block = this.pickup_block();
      if (block === null) {
        return ;
      }
      var piece = block[0]; block = block[1];
      var best_peer = this.find_available_peer(piece);
      var peer = this.ensure_connection(best_peer);
      this.inuse_peer[best_peer] = 1;
      this.pending_block[block] = best_peer;
      peer.send({cmd: 'request_block', piece: piece, block: block});

      _.delay(function() {
        this.pending_block[block] = 0;
        this.inuse_peer[best_peer] = 0;
        _.defer(this.start_process);
      }, this.file_meta.block_size / this.min_speed_limit * 1000);
    },

    onblock_finished: function(piece, block) {
      this.start_process();
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
            this.peerid = msg.peerid;
            if (this.peerid && this.file_system) {
              this.ready = true;
              if (_.isFunction(this.onready)) {
                this.onready();
              }
            }
            break;
          case 'file_meta':
            if (this.file_meta === null)
              break;
            this.file_meta = msg.file_meta;
            for (var i=0; i<this.file_meta.piece_cnt; ++i) {
              this.finished_piece[i] = 0;
              this.piece_queue.push(i);
            }
            this.piece_queue.reverse();
            this.file_system.root.getFile(this.file_meta.hash, {create: true}, function(file_entry) {
              this.file_entry = file_entry;
              var thi$ = this;
              this.file_entry.createWriter(function(fw) {
                fw.seek(0);
                fw.write('\x00');
                fw.seek(thi$.file_meta.size);
                fw.write('\x00');
              });
            });
            break;
          case 'peer_list':
            this.peer_list = msg.peer_list;
            break;
          default:
            break;
        }
      }
    },

    oninitfs: function(fs) {
      this.file_system = fs;

      if (this.peerid && this.file_system) {
        this.ready = true;
        if (_.isFunction(this.onready)) {
          this.onready();
        }
      }
    }
  };

  return {
    Client: Client
  };
});
