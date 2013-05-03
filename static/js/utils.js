// vim: set et sw=2 ts=2 sts=2 ff=unix fenc=utf8:
// Author: Binux<i@binux.me>
//         http://binux.me
// Created on 2013-05-01 18:46:21

define(function() {
  return {
    format_size: function(spare_size) {
      if (spare_size === 0)
        return "0B";
      var spare_str;
      var spare_left;
      if( spare_size >= 1024*1024*1024  )
        {
          spare_left = Math.floor(spare_size/(1024*1024*1024)*10);
          spare_str = (spare_left/10).toString()+"GB";
        }else if( spare_size >= 1024*1024 ){
          spare_left = (Math.floor(spare_size*100/(1024*1024)))/100;
          spare_str = spare_left.toString()+"MB";
        }
        else if(spare_size >= 1024){
          spare_left = Math.floor(spare_size/1024);
          spare_str = spare_left.toString()+"KB";
        }
        else{
          spare_str = spare_size.toFixed(0) + "B";
        }
        return spare_str;
    },

    format_time: function(seconds) {
      if (seconds === Infinity || isNaN(seconds))
        return "";
      var H = seconds / 60 / 60,
      M = seconds % 3600 / 60,
      S = seconds % 60;
      if (H >= 1) {
        return ""+H.toFixed(0)+"h"+M.toFixed(0)+"m";
      } else if (M >= 1) {
        return ""+M.toFixed(0)+"m"+S.toFixed(0)+"s";
      } else if (S >= 1) {
        return ""+S.toFixed(0)+"s";
      } else {
        return ">1s";
      }
    }
  };
});
