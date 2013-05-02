// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-05-01 12:18:24

define(['underscore'], function() {
  if (window.webkitRequestFileSystem) {
    window.requestFileSystem = window.webkitRequestFileSystem;
  }

  function fileSystemFile(size, callback) {
    this.size = size;
    this.callback = callback;

    this.filename = _.uniqueId('file_'+(new Date()).getTime()+'_'+_.random(3721));
    this.fs = null;
    this.file_entry = null;

    this.init();
  }

  fileSystemFile.prototype = {
    // public
    write: function(blob, offset, callback) {
      if (!this.file_entry) {
        throw 'file entry is not setted';
      }
      offset = offset || 0;
      this.file_entry.createWriter(function(fw) {
        if (!blob.size) {
          blob= new Blob([blob]);
        }
        fw.seek(offset);
        fw.write(blob);
        if (_.isFunction(callback)) {
          fw.onwriteend = callback;
        }
      });
    },

    readAsBlob: function(start, end, callback) {
      this.file_entry.file(function(file) {
        callback(file.slice(start, end));
      });
    },
    
    readAsBinaryString: function(start, end, callback) {
      this.readAsBlob(start, end, function(blob) {
        var reader = new FileReader();
        reader.onload = function(evt) {
          callback(evt.target.result);
        };
        reader.readAsBinaryString(blob);
      });
    },

    toURL: function() {
      return this.file_entry.toURL();
    },

    // private
    init: function() {
      requestFileSystem(window.TEMPORARY, 5*1024*1024*1024 /* 5G */, _.bind(this.oninitfs, this), this.onerror);
      window.addEventListener('beforeunload', _.bind(function() {
        if (this.file_entry) {
          this.file_entry.remove(function() {}, this.onerror);
        }
      }, this));
    },

    onerror: function(e) {
      console.log(e);
      switch (e.code) {
        case FileError.QUOTA_EXCEEDED_ERR:
          alert('Error writing file, is your harddrive almost full?');
          break;
        case FileError.NOT_FOUND_ERR:
          alert('NOT_FOUND_ERR');
          break;
        case FileError.SECURITY_ERR:
          alert('SECURITY_ERR');
          break;
        case FileError.INVALID_MODIFICATION_ERR:
          alert('INVALID_MODIFICATION_ERR');
          break;
        case FileError.INVALID_STATE_ERR:
          alert('INVALID_STATE_ERROR');
          break;
        default:
          alert('webkitRequestFileSystem failed as ' + e.code);
      }
    },

    // step 1
    oninitfs: function(fs) {
      this.fs = fs;
      this.check_exist();
    },

    // step 2
    check_exist: function() {
      this.fs.root.getFile(this.filename, {}, function(file_entry) {
        file_entry.remove(function() { _.bind(this.create_file, this); });
      }, _.bind(this.create_file, this), this.onerror);
    },

    // step 3
    create_file: function() {
      var This = this;
      this.fs.root.getFile(this.filename, {create: true, exclusive: true}, function(file_entry) {
        This.file_entry = file_entry;
        _.bind(This.alloc, This)(This.size);
      }, this.onerror);
    },

    // step 4
    alloc: function(size) {
      var This = this;
      this.file_entry.createWriter(function(fw) {
        function write() {
          if (size > 0) {
            var write_size = size > (1 << 26) ? (1 << 26) : size; /* 64M */
            fw.write(new Blob([new Uint8Array(write_size)]));
            size -= write_size;
          } else if (_.isFunction(This.callback)) {
            This.callback();
          }
        }

        fw.onwriteend = function() {
          write();
        };
        write();
      });
    }
  };

  return {
    File: fileSystemFile
  };
});
