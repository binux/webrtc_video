#!/usr/bin/env python
# -*- encoding: utf-8 -*-
# vim: set et sw=4 ts=4 sts=4 ff=unix fenc=utf8:
# Author: Binux<i@binux.me>
#         http://binux.me
# Created on 2013-04-20 20:03:41

from base import *

class NewHandler(BaseHandler):
    def get(self):
        self.render('room/new.html')


handlers = [
        (r'/room/new', NewHandler),
        ]
