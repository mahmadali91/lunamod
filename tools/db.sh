#!/bin/bash
# SQL к рабочей базе lunaramod.ru (mahmadgv_luna) через SSH-алиас `sklad`.
# Пароль берётся из ~/lunara/sklad.env на сервере и нигде не печатается.
# Пример: tools/db.sh "SELECT COUNT(*) FROM Product"   или   echo "SHOW TABLES" | tools/db.sh
SQL="${1:-$(cat)}"
printf '%s' "$SQL" | ssh -o BatchMode=yes sklad 'cd ~/lunara; umask 077; F=$(mktemp); trap "rm -f $F" EXIT
perl -ne "if(/^DATABASE_URL=\"?mysql:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d*)\/([^?\"]+)/){(\$u,\$p,\$h,\$o,\$d)=(\$1,\$2,\$3,\$4||3306,\$5); s/%([0-9A-Fa-f]{2})/chr(hex(\$1))/ge for \$u,\$p; print qq([client]\nuser=\$u\npassword=\$p\nhost=\$h\nport=\$o\ndatabase=\$d\n)}" sklad.env > $F
mysql --defaults-extra-file=$F --table' 2>&1 | grep -v '^Welcome to LTD BeGet'
