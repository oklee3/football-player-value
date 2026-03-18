import ScraperFC as sfc
import pandas as pd
import os

def get_fbref_players_last_3(league):
    """
    Scrape FBref player stats for the 3 most recent seasons of a league.
    """
    fb = sfc.FBref(wait_time=6)

    valid_seasons = fb.get_valid_seasons(league)
    print("Valid seasons:", valid_seasons)

    last_3_seasons = sorted(
        valid_seasons.keys(),
        key=lambda k: int(k.split("-")[0]),  # sort by start year
        reverse=True
    )[:3]

    for season in last_3_seasons:
        stats_dict = fb.scrape_all_stats(season, league)

        safe_league = league.replace(" ", "_")
        out_dir = os.path.join("fbref_player_stats_csv", f"{safe_league}_{season}")
        os.makedirs(out_dir, exist_ok=True)
        for category, cat_dict in stats_dict.items():
            df = cat_dict.get("player")
            if isinstance(df, pd.DataFrame) and not df.empty:
                df.to_csv(os.path.join(out_dir, f"{category}_player.csv"), index=False)
                print(f"Saved {category}_player.csv with {len(df)} rows")


league = "England Premier League"
test_df = get_fbref_players_last_3(league)
