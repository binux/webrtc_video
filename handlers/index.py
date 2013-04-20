#!/usr/bin/env python
# -*- encoding: utf-8 -*-
# vim: set et sw=4 ts=4 sts=4 ff=unix fenc=utf8:
# Author: Binux<i@binux.me>
#         http://binux.me
# Created on 2013-04-20 13:30:18

from base import *

class IndexHandler(BaseHandler):
    def get(self):
        self.render('index.html')

handlers = [
        (r'/', IndexHandler),
        ]
