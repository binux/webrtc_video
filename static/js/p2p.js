// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-22 17:20:48

define(['peer', 'http_peer', 'file_system', 'underscore', 'lib/sha1.min'], function(peer, hpeer, FileSystem) {
  function Client() {
    this.peerid = null;
    this.file_meta = null;
    this.file = null;
    this.ws = null;
    this.peers = {};
    this.ready = false;
    this.min_speed_limit = 1*1024; // 1kb/s

    this.block_per_connect = 4;
    this.connect_limit = 30;
    this.inuse_peer = {};
    this.bad_peer = {};
    this.blocked_peer = {};

    this.piece_queue = [];
    this.finished_piece = [];
    this.finished_block = {};
    this.pending_block = {};
    this.block_chunks = {};

    this.peer_speed = {};
    this.peer_trans = {};

    this.init();
  }

  Client.prototype = {
    init: function() {
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
        else
          p = new peer.Peer(this.ws, this.peerid, peerid);

        this.inuse_peer[peerid] = 0;
        p.onclose = _.bind(function() {
          console.log('peer connect with '+peerid+' disconnected;');
          delete this.peers[peerid];
          if (_.isFunction(this.onpeerdisconnect)) {
            this.onpeerdisconnect(p);
          }
        }, this);
        p.onmessage = _.bind(function(data) {
          var msg = JSON.parse(data);
          //console.log('FROM:'+p.target+': '+(msg.cmd||msg));
          switch (msg.cmd) {
            case 'request_block':
              this.send_block(p, msg.piece, msg.block);
              break;
            case 'block':
              this.recv_block(p, msg.piece, msg.block, msg.data);
              break;
            default:
              break;
          } 
        }, this);
        p.onspeedreport = _.bind(function(report) { this.speed_report(p, report); }, this);
        if (connect) {
          p.connect();
        }
        this.peers[peerid] = p;
        if (_.isFunction(this.onpeerconnect)) {
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
        peer.send({
          cmd: 'block',
          piece: piece,
          block: block,
          data: data
        });
      });
    },

    request_block: function(peer, piece, block) {
      //console.debug('request_block: '+peer.target+', '+piece+', '+block);
      peer.send({cmd: 'request_block', piece: piece, block: block});
    },

    recv_block: function(peer, piece, block, data) {
      //console.log('recv block '+piece+','+block);
      if (this.finished_block[piece] && this.finished_block[piece][block] != 1) {
        if (this.pending_block[piece][block]) {
          this.inuse_peer[this.pending_block[piece][block]] -= 1;
          this.pending_block[piece][block] = 0;
        }
        this.finished_block[piece][block] = 1;
        // save as binnary data
        var binarray = new Uint8Array(data.length);
        for (var i=0;i<data.length;i++) {
          binarray[i] = data.charCodeAt(i) & 0xff;
        }
        this.block_chunks[piece][block] = binarray;
        this.onblock_finished(piece, block);
      }
    },

    speed_report: function(peer, report) {
      this.peer_trans[peer.id] = this.peer_speed[peer.id] = report;
      this._reset_speed();
    },
    _reset_speed: _.throttle(function() {
      var send = 0, recv = 0;
      for (var k in this.peer_speed) {
        send += this.peer_speed[k].send;
        recv += this.peer_speed[k].recv;
      }
      if (_.isFunction(this.onspeedreport)) {
        var sended = _.reduce(_.pluck(this.peer_trans, 'sended'), function(memo, num) { return memo+num; }, 0);
        var recved = _.reduce(_.pluck(this.peer_trans, 'recved'), function(memo, num) { return memo+num; }, 0);
        this.onspeedreport({send: send, sended: sended, recv: recv, recved: recved});
      }
      this.peer_speed = {};
      this._reset_speed();
    }, 1000),

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
      this.inuse_peer[best_peer] += 1;
      this.pending_block[piece][block] = best_peer;
      this.request_block(peer, piece, block);

      // set timeout for block, abandon all pending block when one is timeout
      _.delay(_.bind(this.check_pending, this, best_peer, piece, block),
              this.file_meta.block_size / this.min_speed_limit * 1000);

      return true;
    },

    check_pending: function(key, piece, block) {
      if (this.pending_block[piece] && this.pending_block[piece][block] == key) {
        console.log('block '+piece+', '+block+' from '+key+' timeout.');
        for (var p in this.pending_block) {
          for (var b=0; b<this.pending_block[p].length; b++) {
            if (this.pending_block[p][b] == key) {
              this.inuse_peer[key] -= 1;
              this.pending_block[p][b] = 0;
              this.bad_peer[key] = this.bad_peer[key] || 0;
              this.bad_peer[key] += 1;
            }
          }
        }
        _.defer(_.bind(this.start_process, this));
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
            This.onfinished();
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
