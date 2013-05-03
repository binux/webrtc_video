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
        self.file.seek(data['start'])
        block = self.file.read(data['end'] - data['start'])
        self.write_message('%s,%s|%s' % (data['piece'], data['block'], block), True)

    def on_close(self):
        pass

handlers = [
        (r'/file/(\w+)', FileWebSocket),
        ]
