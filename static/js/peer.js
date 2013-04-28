// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-24 10:48:28


define(['underscore'], function() {
  var Browser = null;
  var RTCPeerConnection = null;

  if (window.mozRTCPeerConnection) {
    Browser = 'moz';
    RTCPeerConnection = mozRTCPeerConnection;
    RTCSessionDescription = mozRTCSessionDescription;
    RTCIceCandidate = mozRTCIceCandidate;
  } else if (window.webkitRTCPeerConnection) {
    Browser = 'webkit';
    RTCPeerConnection = webkitRTCPeerConnection;
  }

  function Peer(ws, origin, target) {
    this.ws = ws;
    this.origin = origin;
    this.target = target;
    this.ready = false;

    this.peer_connection = null;
    this.data_channel = null;

    if (Browser == 'moz') {
      this.pc_config = {
        iceServers: [{url: "stun:23.21.150.121"}]
      };
    } else if (Browser == 'webkit') {
      this.pc_config = {
        iceServers: [{url: "stun:stun.l.google.com:19302"}]
      };
    }

    this.pc_constraints = {
      optional: [
        {DtlsSrtpKeyAgreement: true},
        {RtpDataChannels: true}
      ]
    };

    this.maybe_init();
  }

  Peer.prototype = {
    maybe_init: function() {
      if (this.peer_connection === null) {
        this.init();
      }
    },

    init: function() {
      console.debug('Creating PeerConnection');
      try {
        this.peer_connection = new RTCPeerConnection(this.pc_config, this.pc_constraints);
        this.peer_connection.onicecandidate = _.bind(this.onicecandidate, this);
        this.peer_connection.onaddstream = _.bind(this.onaddstream, this);
        this.peer_connection.onremovestream = _.bind(this.onremovestream, this);
        this.peer_connection.ondatachannel = _.bind(this.ondatachannel, this);
        this.peer_connection.oniceconnectionstatechange = _.bind(this.oniceconnectionstatechange, this);
      } catch (e) {
        console.log('Failed to create PeerConnection, exception: '+e.message);
      }

      if (Browser == 'moz') {
        navigator.mozGetUserMedia({video:true, fake:true}, function (vs) {
          this.peerConnection.addStream(vs);
        });
      }
    },

    connect: function(label) {
      if (this.data_channel) {
        this.data_channel.close();
        this.data_channel = null;
      }
      var option = {};
      if (Browser == 'moz')
        option = {outOfOrderAllowed:true, maxRetransmitNum:0};
      if (Browser == 'webkit')
        option = {reliable: false};
      this.data_channel = this.peer_connection.createDataChannel(label || 'RTCDataChannel', option);
      this.data_channel.onopen = _.bind(this.ondatachannelopen, this);
      // Offer MUST created after data channel created
      var constraints = {"mandatory":{},"optional":[]};
      this.peer_connection.createOffer(_.bind(this.onoffer, this), null, constraints);
    },

    listen: function() {
    },

    send: function(obj) {
      if (this.peer_connection && !this.ready) {
        _.delay(_.bind(this.send, this), 2000, obj);
      } else {
        this.data_channel.send(obj);
      }
    },

    close: function() {
      if (this.data_channel) {
        this.data_channel.close();
        this.data_channel = null;
      }
      if (this.peer_connection) {
        this.peer_connection.close();
        this.peer_connection = null;
      }
      this.ready = false;

      if (_.isFunction(this.onclose)) {
        this.onclose();
      }
    },

    // export
    onready: function() {},
    onclose: function() {},
    onmessage: function() {},


    wssend: function(obj) {
      if (!_.isString(obj)) {
        obj = JSON.stringify(obj);
      }
      this.ws.send(obj);
    },

    onwsmessage: function(data) {
      //console.debug('peer:', data);
      if (data.type == 'candidate') {
        var candidate = new RTCIceCandidate(data.candidate);
        this.peer_connection.addIceCandidate(candidate);
      } else if (data.type == 'offer') {
        this.peer_connection.setRemoteDescription(new RTCSessionDescription(data.desc));
        if (this.peer_connection.remoteDescription.type == "offer") {
          this.peer_connection.createAnswer(_.bind(this.onoffer, this));
        }
      }
    },

    onicecandidate: function(evt) {
      if (!evt.candidate) {
        // end of candidates
        return ;
      }
      this.wssend({
        type: 'candidate',
        candidate: evt.candidate,
        target: this.target,
        origin: this.origin
      });
    },

    onoffer: function(desc) {
      this.peer_connection.setLocalDescription(desc);
      this.wssend({
        type: 'offer',
        desc: desc,
        target: this.target,
        origin: this.origin
      });
    },

    oniceconnectionstatechange: function(evt) {
      switch (evt.target.iceConnectionState) {
        case 'disconnected':
        case 'failed':
        case 'closed':
          this.close();
      }
    },

    onaddstream: function() {},
    onremovestream: function() {},

    ondatachannel: function(evt) {
      console.debug('DataChannel created.');
      this.data_channel = evt.channel;
      this.bind_channel_event();
      this.ready = true;
      if (_.isFunction(this.onready)) { this.onready(); }
    },

    bind_channel_event: function() {
      this.data_channel.onopen = _.bind(this.ondatachannelopen, this);
      this.data_channel.onmessage = _.bind(this.ondatachannelmessage, this);
      this.data_channel.onclose = _.bind(this.ondatachannelclose, this);
    },

    ondatachannelopen: function() {
      console.debug('DataChannel openned.');
      this.bind_channel_event();
      this.ready = true;
      if (_.isFunction(this.onready)) { this.onready(); }
    },
    ondatachannelmessage: function(evt) {
      console.log('datachannel:', evt.data);
      if (this.onmessage) {
        this.onmessage(evt.data);
      }
    },
    ondatachannelclose: function() {
      this.close();
    }
  };

  // inherit Peer to support chunked data for chrome
  function PeerWithChunkSupport(ws, target, origin) {
    this.constructer = Peer;
    this.constructer(ws, target, origin);
    delete this.constructer;

    this.chunk_size = 800;
    this.window_size = 30;
    this.resend_interval = 5000;
    this.block_no = 1;
    this.packet_no = 1;
    
    this.send_queue = [];
    this.send_cache = {};
    this.block_cache = {};
  }
  PeerWithChunkSupport.prototype = _.clone(Peer.prototype);

  PeerWithChunkSupport.prototype.send = function(data) {
    var data_size = data.size || data.length;
    var total_packets = Math.ceil(1.0*data_size/this.chunk_size);
    for (var i=0; i<total_packets; ++i) {
      this.send_queue.push({
               b: this.block_no,  // block no.
               p: this.packet_no, // packet no.
               i: i,              // chunk no.
               t: total_packets,   // total no.
               d: data});           // data
      this.packet_no++;
    }
    this.block_no++;
    this.process();
  };

  PeerWithChunkSupport.prototype.retry_send = function(p) {
    if (_.has(this.send_cache, p)) {
      this.data_channel.send(JSON.stringify(this.send_cache[p]));
      _.delay(_.bind(this.retry_send, this), this.resend_interval, p);
      //console.log('send packet: '+p);
    }
  };

  PeerWithChunkSupport.prototype.process = function() {
    while(this.send_queue.length > 0 && _.size(this.send_cache) < this.window_size) {
      var pkg = this.send_queue.shift();
      this.send_cache[pkg.p] = pkg;
      this.retry_send(pkg.p);
    }
  };
  
  PeerWithChunkSupport.prototype.ondatachannelmessage = function(evt) {
    var msg = JSON.parse(evt.data);
    //console.log(msg);
    if (_.has(msg, 'ack')) {
      if (this.send_cache[msg.ack]) {
        delete this.send_cache[msg.ack];
        this.process();
      }
    } else {
      if (!_.has(this.block_cache, msg.b)) {
        this.block_cache[msg.b] = {};
      }
      this.block_cache[msg.b][msg.i] = msg.d;
      console.log({ack:1,p:msg.p});
      this.data_channel.send(JSON.stringify({ack:msg.p}));

      // recived all blocks
      if (msg.t == _.size(this.block_cache[msg.b])) {
        if (_.isFunction(this.onmessage)) {
          this.onmessage(_.values(this.block_cache[msg.b]).join(''));
        }
        delete this.block_cache[msg.b];
      }
    }
  };

  return {
    Peer: PeerWithChunkSupport
  };
});