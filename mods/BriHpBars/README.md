# Bri Hp Bars

## What it does

Swaps out every boss HP bar in the game with the newer type that displays statuses. Also adds HP bars to certain mobs based on which variant you choose.

### How it's made

When adding HP bars to mobs keep in mind that the game can only display 3 at once. That is the reason for only showing 2 of the 5 Shards' HP bars, since you need 1 open for Midir.

Find and replace `/bosslifebar`, `/bosslifebar_ally`, and `/bosslifebar_condition` with `/lifebar_cnd`.
