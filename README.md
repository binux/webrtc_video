webrtc_video
============

A plugin-less P2P video live sharing through webrtc.  
*** only support chrome at present ***

# demo
[http://webrtc.binux.me/](http://webrtc.binux.me/)

# Getting Start
```
easy_install tornado
python application.py
```

`python application.py --help` for more arguments.
  
  
  
# How To Use
### Share
1. visit `/room/new`
2. select a file to share.
3. share this link like `/room/{{ hash }}` to others.
3. **DO NOT CLOSE THE PAGE!**

### Add a http peer
1. make sure the http server support [CORS](http://en.wikipedia.org/wiki/Cross-origin_resource_sharing) and Range header.
2. fill in the url, wait for checking.
3. you can also copy the file to `project_path/data/`, and use a websocket peer by filling in the url like `ws://host:port/file/{{ filename }}`. 

NOTICE: the filename of the file which is placed in `project_path/data/` need alnum(A-Za-z0-9) only.


## License
webrtc_video is licensed under the MIT license.
