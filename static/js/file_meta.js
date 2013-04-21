// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-20 20:17:45

define(['underscore', 'lib/sha1'], function() {
  var workers_cnt = 4; //will crash when using multiple workers

  return {
    choice_piece_size: function(file_size) {
      var psize = 0x40000;
      while (file_size / psize > 512) {
        psize <<= 1;
      }
      return psize;
    },

    choice_block_size: function(piece_size) {
      return piece_size >> 4;
    },

    calculate_hash: function(result) {
      var i,
          workers = [],
          file = result.file,
          total_pieces = Math.floor(file.size / result.piece_size);

      result.sha1_array = [];
      if (_.isFunction(result.onload))
        result.onload = _.bind(result.onload, result);
      if (_.isFunction(result.onprogress))
        result.onprogress = _.bind(result.onprogress, result);

      function check_finished() {
        var done = result.sha1_array.length - _.filter(result.sha1_array, _.isUndefined).length;

        if (_.size(result.sha1_array) === total_pieces && done === total_pieces) {
          var sha1 = CryptoJS.algo.SHA1.create();
          _.map(result.sha1_array, _.bind(sha1.update, sha1));
          result.hash = sha1.finalize().toString();
          if (_.isFunction(result.onload)) {
            result.onload(result);
          }
        }

        if (_.isFunction(result.onprogress)) {
          result.onprogress({done: done, total: total_pieces});
        }
      }

      for (i=0; i<workers_cnt; ++i) {
        var worker = new Worker('/static/js/sha1_worker.js');
        worker.onmessage = function(evt) {
          console.log('sha1-worker result: ', evt.data);
          window.URL.revokeObjectURL(evt.data.blob);
          result.sha1_array[evt.data.id] = evt.data.hash;
          check_finished();
        };
        workers.push(worker);
      }

      for (i=0; i<total_pieces; ++i) {
        var blob = result.file.slice(result.piece_size*i, result.piece_size*(i+1));
        workers[i%workers_cnt].postMessage(_.clone({id: i, blob: window.URL.createObjectURL(blob)}));
      }
    },

    build: function(file) {
      var file_size = file.size;
      var piece_size = this.choice_piece_size(file_size);
      var block_size = this.choice_block_size(piece_size);
      var result = {
        'file': file,
        'filename': file.name,
        'type': file.type,
        'size': file.size,
        'piece_size': piece_size,
        'block_size': block_size
      };
      this.calculate_hash(result);

      return result;
    }
  };
});
