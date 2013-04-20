// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-04-20 20:17:45

define(['underscore', 'lib/sha1'], function() {
  var works_cnt = 5;

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

    calculate_hash: function(file, piece_size, callback) {
      var i, workers = [];
      var result = [], total_pieces = Math.floor(file.size / piece_size);

      function check_finished() {
        if (result.length == total_pieces && _.every(result, _.isString)) {
          var sha1 = CryptoJS.algo.SHA1.create();
          _.map(result, _.bind(sha1.update, sha1));
          callback({sha1_array: result, hash: sha1.finalize().toString()});
          return true;
        }
        return false;
      }

      for (i=0; i<works_cnt; ++i) {
        var worker = new Worker('/static/js/sha1_worker.js');
        worker.onmessage = function(evt) {
          console.log('sha1-worker result: ', evt.data);
          result[evt.data.id] = evt.data.hash;
          check_finished();
        };
        workers.push(worker);
      }

      for (i=0; i<total_pieces; ++i) {
        var reader = new FileReader();
        reader.onload = (function(i) {
          return function(evt) {
            workers[i%works_cnt].postMessage({id: i, data: evt.target.result});
          };
        })(i);
        reader.readAsBinaryString(file.slice(piece_size*i, piece_size*(i+1)));
      }
    },

    build: function(file, callback) {
      var file_size = file.size;
      var piece_size = this.choice_piece_size(file_size);
      var block_size = this.choice_block_size(piece_size);
      var result = {
        'filename': file.name,
        'type': file.type,
        'size': file.size,
        'piece_size': piece_size,
        'block_size': block_size
      };

      function _callback(hash) {
        callback(_.extend(result, hash));
      }

      this.calculate_hash(file, piece_size, _callback);
    }
  };
});
