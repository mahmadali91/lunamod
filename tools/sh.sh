#!/bin/bash
# Команда в папке рабочего сайта ~/lunara на хостинге. Пример: tools/sh.sh "ls app/server/src"
ssh -o BatchMode=yes sklad "cd ~/lunara && $*" 2>&1 | grep -v '^Welcome to LTD BeGet'
