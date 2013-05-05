// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-22 17:20:48

define(['peer', 'http_peer', 'ws_peer', 'file_system', 'underscore', 'lib/sha1.min'], function(peer, hpeer, ws_peer, FileSystem) {
  function sum(list) {
    return _.reduce(list, function(memo, num){ return memo + num; }, 0);
  }

  function now() {
    return (new Date()).getTime();
  }

  function Client() {
    this.block_per_connect = 1;
    this.connect_limit = 20;
    this.check_pending_interval = 10*1000; // 10s

    this.init();
  }

  Client.prototype = {
    init: function() {
      this.peerid = null;
      this.file_meta = null;
      this.file = null;
      this.ws = null;
      this.peers = {};
      this.ready = false;

      this.inuse_peer = {};
      this.bad_peer = {};
      this.blocked_peer = {};

      this.piece_queue = [];
      this.finished_piece = [];
      this.finished_block = {};
      this.pending_block = {};
      this.block_chunks = {};

      this._sended = 0;
      this._recved = 0;
      this.peer_trans = {};
      this.last_speed_report = now();
      var speed_report_interval = setInterval(_.bind(this.speed_report, this), 1000);

      this.ws = new WebSocket(
        (location.protocol == 'https:' ? 'wss://' : 'ws://')+location.host+'/room/ws');
      this.ws.onopen = _.bind(this.onwsopen, this);
      this.ws.onmessage = _.bind(this.onwsmessage, this);

    },

    new_room: function(file_meta, callback) {
      this.ws.send(JSON.stringify({cmd: 'new_room', file_meta: file_meta}));
    },

    join_room: function(room_id) {
      this.ws.send(JSON.stringify({cmd: 'join_room', roomid: room_id}));
    },

    add_http_peer: function(url) {
      this.ws.send(JSON.stringify({cmd: 'add_http_peer', url: url,
                                   bitmap: client.finished_piece.join('')}));
    },

    update_peer_list: function() {
      this.ws.send(JSON.stringify({cmd: 'get_peer_list'}));
    },

    update_bitmap: function() {
      this.ws.send(JSON.stringify({cmd: 'update_bitmap', bitmap: client.finished_piece.join('')}));
    },

    health: function() {
      if (!this.file_meta) {
        return 0;
      }

      var i, tmp = [];
      for (i=0; i<this.file_meta.piece_cnt; i++) {
        tmp.push(0);
      }

      var This = this;
      _.each(this.peer_list, function(value, key) {
        for (i=0; i<This.file_meta.piece_cnt; i++) {
          tmp[i] += (value.bitmap[i] == '1' ? 1 : 0);
        }
      });

      var min = _.min(tmp);
      return min+(_.filter(tmp, function(num) { return num > min; }).length / tmp.length);
    },

    // export 
    onready: function() { console.log('onready'); },
    onfilemeta: function(file_meta) { console.log('onfilemeta', file_meta); },
    onpeerlist: function(peer_list) { console.log('onpeerlist', peer_list); },
    onpeerconnect: function(peer) { console.log('onnewpeer', peer); },
    onpeerdisconnect: function(peer) { console.log('onnewpeer', peer); },
    onpiece: function(piece) { console.log('onpiece', piece); },
    onfinished: function() { console.log('onfinished'); },
    onspeedreport: function(report) { console.log('onspeedreport', report); },

    // private
    ensure_connection: function(peerid, connect) {
      if (this.peers[peerid]) {
        return this.peers[peerid];
      } else {
        var p;
        if (peerid.indexOf('http:') === 0 || peerid.indexOf('https:') === 0)
          p = new hpeer.Peer(peerid, this);
        else if (peerid.indexOf('ws:') === 0 || peerid.indexOf('wss:') === 0)
          p = new ws_peer.Peer(peerid, this);
        else
          p = new peer.Peer(this.ws, this.peerid, peerid);
        p.trans_id = _.uniqueId('peer_');

        this.inuse_peer[peerid] = 0;
        this.peers[peerid] = p;

        p.onmessage = _.bind(function(data) {
          if (_.isObject(data) || data.indexOf('{') === 0) {
            var msg = _.isObject(data) ? data : JSON.parse(data);
            if (msg.cmd == 'request_block') {
              this.send_block(p, msg.piece, msg.block);
            } else if (msg.cmd == 'block') {
              this.recv_block(p, msg.piece, msg.block, msg.data);
            }
          } else {  // proto 2
            var piece_block = data.slice(0, data.indexOf('|')).split(',');
            data = data.slice(data.indexOf('|')+1);
            this.recv_block(p, parseInt(piece_block[0], 10), parseInt(piece_block[1], 10), data);
          }
        }, this);
        p.onclose = _.bind(function() {
          console.log('peer connect with '+peerid+' disconnected;');
          this.remove_pending(peerid);
          delete this.peers[peerid];
          if (_.isFunction(this.onpeerdisconnect)) {
            this.onpeerdisconnect(p);
          }
        }, this);
        if (connect) {
          p.connect();
        }

        if (_.isFunction(this.onpeerconnect)) {
          console.log('new connect to '+peerid);
          this.onpeerconnect(p);
        }
        return p;
      }
    },

    send_block: function(peer, piece, block) {
      //console.log('sending block '+piece+','+block);
      if (!this.file) return;
      if (this.finished_piece[piece] != 1) return;

      var start = this.file_meta.piece_size*piece + this.file_meta.block_size*block;
      this.file.readAsBinaryString(start, start+this.file_meta.block_size, function(data) {
        peer.send(''+piece+','+block+'|'+data);
      });
    },

    request_block: function(peer, piece, block) {
      //console.debug('request_block: '+peer.target+', '+piece+', '+block);
      this.inuse_peer[peer.id] += 1;
      this.pending_block[piece][block] = peer.id;
      peer.send({cmd: 'request_block', piece: piece, block: block});
    },

    recv_block: function(peer, piece, block, data) {
      //console.log('recv block '+piece+','+block);
      this.inuse_peer[peer.id] -= 1;
      if (this.finished_block[piece] && this.finished_block[piece][block] != 1) {
        // conv to arraybuffer
        if (data.byteLength === undefined) {
          var binarray = new Uint8Array(data.length);
          for (var i=0;i<data.length;i++) {
            binarray[i] = data.charCodeAt(i) & 0xff;
          }
          data = binarray;
        }

        if (this.pending_block[piece][block]) {
          this.pending_block[piece][block] = 0;
        }
        this.finished_block[piece][block] = 1;
        this.block_chunks[piece][block] = data;
        this.onblock_finished(piece, block);
      }
    },

    speed_report: function() {
      var This = this;
      _.map(_.values(this.peers), function(peer) {
        This.peer_trans[peer.trans_id] = {
          sended: peer.sended(),
          recved: peer.recved()
        };
      });
      var _sended = sum(_.pluck(_.values(this.peer_trans), 'sended')) || 0;
      var _recved = sum(_.pluck(_.values(this.peer_trans), 'recved')) || 0;

      if (_.isFunction(this.onspeedreport)) {
        var elapsed = (now() - this.last_speed_report) / 1000;
        this.onspeedreport({send: (_sended - this._sended) / elapsed, sended: _sended,
                            recv: (_recved - this._recved) / elapsed, recved: _recved});
      }

      this._sended = _sended;
      this._recved = _recved;
      this.last_speed_report = now();
    },

    pickup_block: function() {
      if (_.isEmpty(this.piece_queue)) {
        return null;
      }

      // choice a piece
      var i, j, block_cnt = Math.ceil(1.0 * this.file_meta.piece_size / this.file_meta.block_size);

      for (i=0; i<this.piece_queue.length; i++) {
        var piece = this.piece_queue[i];

        // init if it's a new piece
        if (this.block_chunks[piece] === undefined) {
          this.block_chunks[piece] = [];
          this.finished_block[piece] = [];
          this.pending_block[piece] = [];
          for (i=0; i<block_cnt; ++i) {
            this.finished_block[piece][i] = 0;
            this.pending_block[piece][i] = 0;
          }
        }

        // pick up block
        for (j=0; j<block_cnt; ++j) {
          if (this.finished_block[piece][j] || this.pending_block[piece][j])
            continue;
          return [piece, j];
        }
      }
      return null;
    },

    find_available_peer: function(piece) {
      var peers = [];
      for (var key in this.peer_list) {
        if (key == this.peerid) continue;
        if (this.peer_list[key].bitmap[piece] &&
            (!_.has(this.inuse_peer, key) || this.inuse_peer[key] < this.block_per_connect) &&
            !this.blocked_peer[key]) {
          peers.push(key);
        }
      }
      if (peers.length === 0) {
        return null;
      } else if (peers.length == 1) {
        return peers[0];
      }

      var This = this;
      var peers_score = _.map(peers, function(key) {
        return (This.bad_peer[key] || 0) * 1000 +
          (This.peers[key] ? 0 : 1) * 100 +
          (This.inuse_peer[key] || 0) * 10;
      });
      var tmp = [];
      var min_score = _.min(peers_score);
      for (var i=0; i<peers.length; i++) {
        if (peers_score[i] == min_score) {
          tmp.push(peers[i]);
        }
      }

      return tmp[_.random(tmp.length-1)];
    },

    start_process: _.throttle(function() {
      while (_.size(this.inuse_peer) < this.connect_limit && this._start_progress()) {
      }
    }, 100),

    _start_progress: function() {
      // pickup block
      var piece_block = this.pickup_block();
      if (piece_block === null) {
        //console.log('no block to go.');
        return false;
      }
      var piece = piece_block[0]; block = piece_block[1];

      // find available peer
      var best_peer = this.find_available_peer(piece);
      if (best_peer === null) {
        //console.log('no peer has the piece.');
        return false;
      }
      var peer = this.ensure_connection(best_peer, true);

      // mark
      this.request_block(peer, piece, block);

      // set timeout for block, abandon all pending block when one is timeout
      _.delay(_.bind(this.check_pending, this, best_peer, piece, block, peer.recved(), this._recved, now()),
              this.check_pending_interval * 2);

      return true;
    },

    check_pending: function(peerid, piece, block, last_recved, total_recved, last_time) {
      // it's still working on it
      if (this.pending_block[piece] && this.pending_block[piece][block] == peerid && this.peers[peerid]) {
        var recved = this.peers[peerid].recved();
        var speed = (recved - last_recved) / (now() - last_time) * 1000;
        var global_speed = (this._recved - total_recved) / (now() - last_time) * 1000;
        if (speed > global_speed / _.size(this.peers) / 4) {  // 1/4 of avg speed
          // ok
          _.delay(_.bind(this.check_pending, this, peerid, piece, block, recved, this._recved, now()),
                  this.check_pending_interval);
        } else {
          // timeout
          console.log('low download speed from '+peerid+'...', speed, global_speed);
          this.bad_peer[peerid] = this.bad_peer[peerid] || 0;
          this.bad_peer[peerid] += 1;
          // close and block the peer for one block time
          this.peers[peerid].close();
          this.blocked_peer[peerid] = 998;
          _.delay(_.bind(function() {
            delete this.blocked_peer[peerid];
            delete this.inuse_peer[peerid];
            _.defer(_.bind(this.start_process, this));
          }, this), (this.file_meta.block_size / speed > 120 ? 120 : this.file_meta.block_size / speed) * 1000);
          _.defer(_.bind(this.start_process, this));
        }
      }
    },

    remove_pending: function(peerid) {
      for (var p in this.pending_block) {
        for (var b=0; b<this.pending_block[p].length; b++) {
          if (this.pending_block[p][b] == peerid) {
            this.pending_block[p][b] = 0;
          }
        }
      }
    },

    onblock_finished: function(piece, block) {
      // piece finished
      if (_.all(this.finished_block[piece])) {
        var blob = new Blob(this.block_chunks[piece]);
        var This = this;
        this.file.write(blob, this.file_meta.piece_size * piece, function() {
          if (_.isFunction(This.onpiece)) {
            This.onpiece(piece);
          }
          _.defer(_.bind(This.update_bitmap, This));

          // check all finished
          if (_.all(This.finished_piece) && _.isEmpty(This.piece_queue) &&
              _.isFunction(This.onfinished)) {
            This.finishonce = This.finishonce || _.once(This.onfinished);
            This.finishonce();
          }
        });
        this.finished_piece[piece] = 1;
        if (this.piece_queue.indexOf(piece) != -1) {
          this.piece_queue.splice(this.piece_queue.indexOf(piece), 1);
        }
        delete this.block_chunks[piece];
        delete this.finished_block[piece];
        delete this.pending_block[piece];
      }
      _.defer(_.bind(this.start_process, this));
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
            this.ready = true;
            if (_.isFunction(this.onready)) {
              this.onready();
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

            var This = this;
            this.file = new FileSystem.File(this.file_meta.size, function() {
              if (_.isFunction(This.onfilemeta)) {
                This.onfilemeta(This.file_meta);
              }
            });
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
    }
  };

  return {
    Client: Client
  };
});
