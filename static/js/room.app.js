// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-24 15:11:35

define(['jquery', 'p2p', 'utils', 'underscore'], function($, p2p, utils) {
  var J_console = $('#J_console');
  var client = new p2p.Client();
  J_console.append('<li>websocket connecting...');

  client.onready = function() {
    J_console.append('<li>connected. get peerid: '+client.peerid);
    J_console.append('<li>getting file meta...');
    client.join_room(window.roomid);
    client.onfilemeta = function(file_meta) {
      J_console.append('<li>file: '+file_meta.filename+
                          ' size: '+utils.format_size(file_meta.size)+
                          ' ('+file_meta.type+')');
      J_console.append('<li><dl class=info>'+
                        '<dt>progress</dt> <dd id=J_progress>0%</dd>'+
                        '<dt>health</dt> <dd id=J_health>0%</dd>'+
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
    };

    client.onpeerlist = function(peer_list) {
      $('#J_health').text(''+(client.health()*100).toFixed(2)+'%');
      $('#J_peers').text(_.size(peer_list));
      client.start_process();
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

    var create_video = _.once(function(url) {
      J_console.append('<li><div id=J_video_wrap><video id=J_video>video not supported</video></div>');
      var video = $('#J_video').get(0);
      var on_error_time = 0;
      video.src = url;
      video.preload = 'metadata';
      video.autoplay = false;
      video.controls = true;
      video.addEventListener('canplay', function() {
        $('#J_video_wrap').width('auto');
        $('#J_video_wrap').height('auto');
        if (on_error_time) {
          video.currentTime = on_error_time;
          video.play();
        }
      });
      video.addEventListener('error', function() {
        on_error_time = Math.max(0, video.currentTime);
        console.debug('video: play error on '+on_error_time+', retry in 5s.');
        setTimeout(function() {
          $('#J_video_wrap').width($(video).width()); // hold video width
          $('#J_video_wrap').height($(video).height());
          video.load();
        }, 5000);
      });
      video.addEventListener('seeking', _.throttle(function(evt) {
        var seektime = Math.max(0, video.currentTime);
        if (seektime == on_error_time) {
          return ;
        }
        on_error_time = seektime;
        var piece = Math.floor(seektime / video.duration * client.file_meta.piece_cnt);

        var pre_seek = 8;
        for (var i=client.file_meta.piece_cnt-1; i>piece+pre_seek; i--) {
          client.move_top(i);
        }
        for (i=pre_seek; i>0; i--) {
          client.move_top(piece+i);
          client.move_top(piece-i);
        }
        client.move_top(piece);

        client.start_process();
        console.debug('seeking to '+seektime+', move piece '+piece+' to top.');
      }, 500));
    });

    client.onpiece = function(piece) {
      $('#J_progress').text(''+(_.filter(client.finished_piece, _.identity).length / client.finished_piece.length * 100).toFixed(2)+'%');

      if (piece === 0 && 'video/ogg,video/mp4,video/webm'.indexOf(client.file_meta.type) != -1) {
        create_video(client.file.toURL());
      }
    };

    client.onfinished = function() {
      J_console.append('<li>download completed: <a href="'+client.file.toURL()+
                       '" download="'+client.file_meta.filename+'">'+client.file_meta.filename+'</a>');
    };
  };

  return {
    client: client
  };
});
