#!/usr/bin/env python
# -*- encoding: utf-8 -*-
# vim: set et sw=4 ts=4 sts=4 ff=unix fenc=utf8:
# Author: Binux<i@binux.me>
#         http://binux.me
# Created on 2013-05-03 17:03:10

import os
import json
from base import *

class FileWebSocket(BaseWebSocket):
    def open(self, hash):
        logging.debug('ws_peer: new connect')
        if os.path.exists(os.path.join(options.file_path, hash)):
            self.file = open(os.path.join(options.file_path, hash))
        else:
            self.close()

    def on_message(self, message):
        logging.debug('ws_peer: %s' % message)
        data = json.loads(message)

        self.write_message({'cmd': 'start', 'piece': data['piece'], 'block': data['block']})

        pos = data['start']
        self.file.seek(data['start'])
        while pos < data['end']:
            to_read = data['end'] - pos
            if to_read > 1 << 16:  # 64k
                to_read = 1 << 16
            block = self.file.read(to_read)
            self.write_message(block, True)
            pos += to_read

        self.write_message({'cmd': 'end', 'piece': data['piece'], 'block': data['block']})

    def on_close(self):
        pass

handlers = [
        (r'/file/(\w+)', FileWebSocket),
        ]
