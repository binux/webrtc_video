// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-22 15:05:56

define(['jquery', 'file_meta', 'p2p'], function($, file_meta, p2p) {
  var client = new p2p.Client();
  $('#J_live_video').on('change', function(evt) {
    $('#J_box').unbind();
    $('#J_hash').width(0+'%');
    var file = evt.target.files[0];
    var builder = file_meta.build(file);
    builder.onload = function(result) {
      console.log(result);
      if (client.ready) {
        client.new_room(result);
      } else {
        client.onready = function() {
          client.new_room(result);
        };
      }
      client.onfilemeta = function(file_meta) {
        client.write(file, function(evt) {
          client.piece_queue = [];
          client.finished_piece = _.map(client.finished_piece, function() { return 1; });
          client.update_bitmap();
        });
      };
    };
    builder.onprogress = function(data) {
      $('#J_hash').width(data.done/data.total*100+'%');
    };
  });
  $('#J_box').on('click', function() {
    $('#J_live_video').click();
  });

  return {
    client: client
  };
});
