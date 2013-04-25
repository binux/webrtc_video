// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-24 15:11:35

define(['jquery', 'p2p'], function($, p2p) {
  var client = new p2p.Client();
  client.onready = function() {
    client.join_room(window.roomid);
    client.update_peer_list();
    setTimeout(function() {
      for (var key in client.peer_list) {
        if (key == client.peerid) continue;
        var peer = client.ensure_connection(key);
        peer.connect();
        peer.onready = _.bind(function() {
          this.send('hello world from '+client.peerid);
        }, peer);
      }
    }, 5000);
  };

  return {
    client: client
  };
});
