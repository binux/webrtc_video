// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-22 15:05:56

define(['jquery', 'file_meta', 'p2p', 'utils', 'underscore'], function($, file_meta, p2p, utils) {
  var J_console = $('#J_console');

  // feature detect
  var feature = ['JSON', 'WebSocket', 'URL', 'Worker', 'ArrayBuffer', 'Uint8Array',
    'File', 'Blob', 'requestFileSystem', 'FileError', 'RTCPeerConnection', 'RTCIceCandidate',
    'RTCSessionDescription'];
  var miss_feature = false;
  _.each(feature, function(f) {
    if (!window[f]) {
      miss_feature = true;
      J_console.append('<li><span class=error>Need Feature: '+f+'</span>');
    }
  });
  if (miss_feature) return;

  var client = new p2p.Client();
  J_console.append('<li>websocket connecting...');

  client.onready = function() {
    J_console.append('<li>connected. get peerid: '+client.peerid);
    J_console.append('<li>select a file to share: <input type=file id=J_file />');
    $('#J_file').on('change', function(evt) {
      $('#J_file').attr('disabled', true);
      var file = evt.target.files[0];
      J_console.append('size: '+utils.format_size(file.size)+' ('+file.type+')');
      var builder = file_meta.build(file);
      builder.onload = function(result) {
        $('#J_hash').text(result.hash);
        J_console.append('<li>sending file meta...');
        client.new_room(result);
      };
      builder.onprogress = function(data) {
        $('#J_hash').text(''+(data.done/data.total*100).toFixed(2)+'%');
      };
      J_console.append('<li>calculating sha1 hash: <span id=J_hash>0%</span>');

      client.onfilemeta = function(file_meta) {
        client.file.write(file, 0, function(evt) {
          client.piece_queue = [];
          client.finished_piece = _.map(client.finished_piece, function() { return 1; });
          client.update_bitmap();
          J_console.append('<li>room created: <a href="/room/'+file_meta.hash+'" target=_blank>'+
                           location.href.replace(/room\/new.*$/i, 'room/'+file_meta.hash)+'</a>');
          J_console.append('<li><dl class=info>'+
                            '<dt>health</dt> <dd id=J_health>100%</dd>'+
                            '<dt>peers</dt> <dd id=J_peers>1</dd>'+
                            '<dt>connected</dt> <dd id=J_conn>0</dd>'+
                            '<dt>upload</dt> <dd id=J_ups>0B/s</dd> <dd id=J_up>0B</dd>'+
                            '<dt>download</dt> <dd id=J_dls>0B/s</dd> <dd id=J_dl>0B</dd>'+
                           '</dl> <button id=J_refresh_peer_list>refresh</button>');

          $('#J_refresh_peer_list').on('click', function() {
            _.bind(client.update_peer_list, client)();
          });
          client.update_peer_list();
          setInterval(_.bind(client.update_peer_list, client), 60*1000); // 1min
        });
      };
    });
  };

  client.onpeerlist = function(peer_list) {
    $('#J_health').text(''+(client.health()*100).toFixed()+'%');
    $('#J_peers').text(_.size(peer_list));
  };

  client.onpeerconnect = function(peer) {
    $('#J_conn').text(_.size(client.peers));
  };

  client.onpeerdisconnect = function(peer) {
    $('#J_conn').text(_.size(client.peers));
  };

  client.onspeedreport = function(report) {
    $('#J_ups').text(utils.format_size(report.send)+'/s');
    $('#J_dls').text(utils.format_size(report.recv)+'/s');
    $('#J_up').text(utils.format_size(client.sended));
    $('#J_dl').text(utils.format_size(client.recved));
  };

  return {
    client: client
  };
});
