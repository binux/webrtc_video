// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-22 17:20:48

define(['underscore', 'peer', 'lib/sha1.min'], function(__, peer, ___) {
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
    this.min_speed_limit = 3*1024; // 3kb/s

    this.piece_queue = [];
    this.finished_piece = [];

    this.cur_piece = null;
    this.inuse_peer = {};
    this.blocked_peer = {};
    this.finished_block = [];
    this.pending_block = [];

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

    new_room: function(file_meta, callback) {
      this.ws.send(JSON.stringify({cmd: 'new_room', file_meta: file_meta}));
    },

    join_room: function(room_id) {
      this.ws.send(JSON.stringify({cmd: 'join_room', roomid: room_id}));
    },

    update_peer_list: function() {
      this.ws.send(JSON.stringify({cmd: 'get_peer_list'}));
    },

    update_bitmap: function() {
      this.ws.send(JSON.stringify({cmd: 'update_bitmap', bitmap: client.finished_piece.join('')}));
    },

    // export 
    onready: function() { console.log('onready'); },
    onfilemeta: function(file_meta) { console.log('onfilemeta', file_meta); },
    onpeerlist: function(peer_list) { console.log('onpeerlist', peer_list); },
    onpiece: function(piece) { console.log('onpiece', piece); },
    onfinished: function() { console.log('onfinished'); },

    // private
    ensure_connection: function(peerid, connect) {
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
          var msg = JSON.parse(data);
          //console.log('FROM:'+p.target+': '+(msg.cmd||msg));
          switch (msg.cmd) {
            case 'request_block':
              if (this.finished_piece[msg.piece] != 1) break;
              if (!this.file_entry) break;
              var This = this;
              this.file_entry.file(function(file) {
                var start = This.file_meta.piece_size*msg.piece + This.file_meta.block_size*msg.block;
                var blob = file.slice(start, start+This.file_meta.block_size);
                var reader = new FileReader();
                reader.onload = function(evt) {
                  var data = {cmd: 'block',
                    piece: msg.piece,
                    block: msg.block,
                    data: evt.target.result,
                    //sha1: sha1.hash(evt.target.result),
                  };
                  p.send(data);
                };
                reader.readAsBinaryString(blob);
              });
              break;
            case 'block':
              if (msg.piece == this.cur_piece && this.pending_block[msg.block] == peerid) {
                this.pending_block[msg.block] = 0;
                this.finished_block[msg.block] = 1;
                if (_.has(this.inuse_peer, p.target))
                  delete this.inuse_peer[p.target];
                // save as binnary data
                var binarray = new Uint8Array(msg.data.length);
                for (var i=0;i<msg.data.length;i++) {
                  binarray[i] = msg.data.charCodeAt(i) & 0xff;
                }
                this.block_chunks[msg.block] = binarray;
                this.onblock_finished(msg.piece, msg.block);
              }
              break;
            default:
              break;
          } 
        }, this);
        if (connect) {
          p.connect();
        }
        this.peers[peerid] = p;
        return p;
      }
    },

    pickup_block: function() {
      if (_.isEmpty(this.piece_queue) && this.cur_piece === null) {
        return null;
      }

      var i, block_cnt = Math.ceil(1.0 * this.file_meta.piece_size / this.file_meta.block_size);
      if (this.cur_piece === null) {
        this.cur_piece = this.piece_queue.pop();
        this.block_chunks = [];
        this.finished_block = [];
        this.pending_block = [];
        for (i=0; i<block_cnt; ++i) {
          this.finished_block[i] = 0;
          this.pending_block[i] = 0;
        }
      }

      if (_.every(this.finished_block, _.identity)) {
        // piece finished
        var blob = new Blob(this.block_chunks);
        var This = this;
        this.write(blob, function() {
          if (_.isFunction(This.onpiece)) {
            This.onpiece(This.cur_piece);
          }
          This.finished_piece[This.cur_piece] = 1;
          This.cur_piece = null;
          _.defer(_.bind(This.start_process, This));
          if (_.every(This.finished_piece, _.identity) && _.isFunction(This.onfinished)) {
            This.onfinished();
          }
        }, this.file_meta.piece_size*this.cur_piece);
        return null;
      }

      for (i=0; i<block_cnt; ++i) {
        if (this.finished_block[i] || this.pending_block[i])
          continue;
        return [this.cur_piece, i];
      }

      return null;
    },

    find_available_peer: function(piece) {
      for (var key in this.peer_list) {
        if (key == this.peerid) continue;
        if (this.peer_list[key]['bitmap'][piece] && !_.has(this.inuse_peer, key) && !_.has(this.blocked_peer, key)) {
          return key;
        }
      }
      return null;
    },

    start_process: _.throttle(function() {
      var block = this.pickup_block();
      if (block === null) {
        console.debug('no block to go.');
        return ;
      }
      var piece = block[0]; block = block[1];
      var best_peer = this.find_available_peer(piece);
      if (best_peer === null) {
        console.debug('no peer has the piece.');
        return ;
      }
      var peer = this.ensure_connection(best_peer, true);
      this.inuse_peer[best_peer] = 1;
      this.pending_block[block] = best_peer;
      //console.debug('request_block: '+piece+','+block);
      peer.send({cmd: 'request_block', piece: piece, block: block});

      var This = this;
      _.delay(function() {
        if (This.cur_piece == piece && This.pending_block[block] == best_peer) {
          This.pending_block[block] = 0;
          if (_.has(This.inuse_peer, best_peer))
            delete This.inuse_peer[best_peer];
          _.defer(_.bind(This.start_process, This));
        }
      }, This.file_meta.block_size / This.min_speed_limit * 1000);
    }, 100),

    write: function(block, callback, offset) {
      if (!this.file_entry) {
        throw 'file entry is not setted';
      }
      offset = offset || 0;
      this.file_entry.createWriter(function(fw) {
        if (!block.size) {
          block = new Blob([block]);
        }
        fw.seek(offset);
        fw.write(block);
        if (_.isFunction(callback)) {
          fw.onwriteend = callback;
        }
      });
    },

    onblock_finished: function(piece, block) {
      //console.debug('recv_block: '+piece+','+block);
      this.start_process();
    },

    onwsopen: function() { },

    onwsmessage: function(evt) {
      var msg = JSON.parse(evt.data);

      if (!msg.cmd && msg.type && msg.origin) {
        var peer = this.ensure_connection(msg.origin, false);
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
            if (this.file_meta !== null)
              break;
            this.file_meta = msg.file_meta;
            for (var i=0; i<this.file_meta.piece_cnt; ++i) {
              this.finished_piece[i] = 0;
              this.piece_queue.push(i);
            }
            this.piece_queue.reverse();

            var This = this;
            var filename = this.peerid+'.'+this.file_meta.hash;
            var create_file = function() {
              This.file_system.root.getFile(filename,
                                            {create: true, exclusive: true},
                                            function(file_entry) {
                This.file_entry = file_entry;
                This.file_entry.createWriter(function(fw) {
                  fw.onwriteend = function() {
                    if (_.isFunction(This.onfilemeta)) {
                      This.onfilemeta(This.file_meta);
                    }
                  };
                  fw.write(new Blob([new ArrayBuffer(This.file_meta.size)]));
                });
              });
            };

            this.file_system.root.getFile(filename, {}, function(file_entry) {
              file_entry.remove(function() { _.defer(create_file); });
            }, create_file);

            break;
          case 'peer_list':
            this.peer_list = msg.peer_list;
            if (_.isFunction(this.onpeerlist)) {
              this.onpeerlist(this.peer_list);
            }
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
