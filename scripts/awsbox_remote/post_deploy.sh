#!/bin/sh

if [ ! -f $HOME/var/root.cert ] ; then
    echo ">> generating keypair"
    node scripts/postinstall.js
    mv var/root.cert var/root.secretkey $HOME/var
else
    echo ">> no keypair needed.  you gots one"
fi

node scripts/l10n-update.js

echo ">> generating ver.txt"
cd ../git
git log --pretty=%h -1 > ../code/resources/static/ver.txt
cd ../code

echo ">> generating production resources"
env CONFIG_FILES=config/aws.json scripts/compress

echo ">> updating strings"
cd $HOME/locale
svn up
cd $HOME
./locale/compile-json.sh locale/ code/resources/static/i18n/

echo ">> generating production resources"
code/scripts/compress
