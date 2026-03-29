# Git Rebase Keep Local Alias

```sh
git config --global alias.rebase-keep-local '!zsh -lc '\''git diff --name-only --diff-filter=U -z | while IFS= read -r -d "" f; do git checkout --theirs -- "$f"; git add -- "$f"; done; git -c core.editor=true rebase --continue'\'''
```
