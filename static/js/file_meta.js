// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-20 20:17:45

define(['underscore', 'lib/sha1.min'], function(__, _sha1) {
  var workers_cnt = 4; //will crash when using multiple workers

  return {
    choice_piece_size: function(file_size) {
      var psize = 1 << 20; // 1M 
      while (file_size / psize > 128) {
        psize <<= 1;
      }
      return psize;
    },

    choice_block_size: function(piece_size) {
      var bsize = piece_size;
      while (bsize > 1 << 23) { // 8M
        bsize >>= 1;
      }
      return bsize;
    },

    calculate_hash: function(builder) {
      var i,
          workers = [],
          file = builder.file,
          piece_size = builder.result.piece_size,
          total_pieces = builder.result.piece_cnt;

      var sha1_array = [];

      var check_finished = _.throttle(function() {
        var done = _.filter(sha1_array, _.isString).length;

        if (_.isFunction(builder.onprogress)) {
          builder.onprogress({done: done, total: total_pieces});
        }

        if (done === total_pieces) {
          builder.result.hash = sha1.hash(sha1_array.join(''));
          builder.result.sha1_array = sha1_array;
          if (_.isFunction(builder.onload) && !builder.onload_once) {
            builder.onload_once = true;
            builder.onload(builder.result);
          }
        }
      }, 100);

      for (i=0; i<workers_cnt; ++i) {
        var worker = new Worker('/static/js/sha1_worker.js');
        worker.onmessage = function(evt) {
          //console.log('sha1-worker result: ', evt.data);
          sha1_array[evt.data.id] = evt.data.hash;
          check_finished();
          window.URL.revokeObjectURL(evt.data.blob);
        };
        workers.push(worker);
      }

      for (i=0; i<total_pieces; ++i) {
        var blob = file.slice(piece_size*i, piece_size*(i+1));
        var blob_url = window.URL.createObjectURL(blob);
        workers[i%workers_cnt].postMessage(_.clone({id: i, blob: blob_url}));
      }
    },

    build: function(file) {
      var file_size = file.size;
      var piece_size = this.choice_piece_size(file_size);
      var block_size = this.choice_block_size(piece_size);
      var result = {
        filename: file.name,
        type: file.type,
        size: file.size,
        piece_size: piece_size,
        piece_cnt: Math.ceil(1.0*file_size / piece_size),
        block_size: block_size
      };

      var builder = {
        'file': file,
        'result': result
      };

      this.calculate_hash(builder);

      return builder;
    }
  };
});
