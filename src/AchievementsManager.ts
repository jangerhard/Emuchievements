import {AllAchievements, GlobalAchievements, Hook} from "./SteamClient";
import {ServerAPI} from "decky-frontend-lib";
import {AchievementsData} from "./state";
import {retroAchievementToSteamAchievement} from "./Mappers";
import localforage from "localforage";
import {Game, GetGameInfoAndUserProgressParams} from "./interfaces";

const database = 'emuchievements';

localforage.config({
	name: database,
});

// const romRegex = "(\\/([a-zA-Z\\d-:_.\\s])+)+(?!\\.AppImage)(\\.zip|\\.7z|\\.iso|\\.bin|\\.chd|\\.cue|\\.img|\\.a26|\\.lnx|\\.ngp|\\.ngc|\\.3dsx|\\.3ds|\\.app|\\.axf|\\.cci|\\.cxi|\\.elf|\\.n64|\\.ndd|\\.u1|\\.v64|\\.z64|\\.nds|\\.dmg|\\.gbc|\\.gba|\\.gb|\\.ciso|\\.dol|\\.gcm|\\.gcz|\\.nkit\\.iso|\\.rvz|\\.wad|\\.wia|\\.wbfs|\\.nes|\\.fds|\\.unif|\\.unf|\\.json|\\.kp|\\.nca|\\.nro|\\.nso|\\.nsp|\\.xci|\\.rpx|\\.wud|\\.wux|\\.wua|\\.32x|\\.cdi|\\.gdi|\\.m3u|\\.gg|\\.gen|\\.md|\\.smd|\\.sms|\\.ecm\\|.mds|\\.pbp|\\.dump|\\.gz|\\.mdf|\\.mrg|\\.prx|\\.bs|\\.fig|\\.sfc|\\.smc|\\.swx|\\.pc2|\\.wsc|\\.ws)";
const romRegex = "(\\/([a-zA-Z\\d-:_.\\s])+)+(?!\\.AppImage)(\\.zip|\\.7z|\\.iso|\\.bin|\\.chd|\\.cue|\\.img|\\.a26|\\.lnx|\\.ngp|\\.ngc|\\.elf|\\.n64|\\.ndd|\\.u1|\\.v64|\\.z64|\\.nds|\\.dmg|\\.gbc|\\.gba|\\.gb|\\.ciso|\\.nes|\\.fds|\\.unif|\\.unf|\\.32x|\\.cdi|\\.gdi|\\.m3u|\\.gg|\\.gen|\\.md|\\.smd|\\.sms|\\.ecm\\|.mds|\\.pbp|\\.dump|\\.gz|\\.mdf|\\.mrg|\\.prx|\\.bs|\\.fig|\\.sfc|\\.smc|\\.swx|\\.pc2|\\.wsc|\\.ws)";

export class AchievementManager
{

	private achievements: { [key: number]: AllAchievements} = { 0: { loading: false }};

	private globalAchievements: { [key: number]: GlobalAchievements } = { 0: { loading: false }};

	private loading: {[key: number]: boolean} = { 0: false};

	private readonly serverAPI: ServerAPI;

	private appDataUnregister: Hook | null = null;

	constructor(serverAPI: ServerAPI)
	{
		this.serverAPI = serverAPI;
	}

	public async updateCache(appId: string, newData: AchievementsData)
	{
		await localforage.setItem(appId, newData);
	};

	public clearCache()
	{
		localforage.clear();
	};

	public async getCache(appId: string): Promise<AchievementsData | null>
	{
		return await localforage.getItem<AchievementsData>(appId);
	};

	public async needCacheUpdate(lastUpdatedAt: Date, appId: string)
	{
		const now = new Date();
		const durationMs = Math.abs(lastUpdatedAt.getTime() - now.getTime());

		const minutesBetweenDates = durationMs / (60 * 1000);
		return minutesBetweenDates > 5 || await this.getCache(appId)===null;
	};

	public async getAchievementsForGame(serverAPI: ServerAPI, app_id: number)
	{
		return new Promise<AchievementsData | undefined>(async (resolve, reject) =>
		{
			const cache = await this.getCache(`${app_id}`);
			if (cache && !await this.needCacheUpdate(cache.last_updated_at, `${app_id}`)) {
				resolve(cache);
			} else {
				const shortcut = (await SteamClient.Apps.GetAllShortcuts()).find(shortcut => shortcut.appid===app_id)
				if (shortcut && shortcut.data.strExePath)
				{
					const exe = shortcut.data.strExePath
					console.log(exe)
					const rom = exe.match(new RegExp(romRegex, "i"))?.[0];
					if (rom)
					{
						console.log(rom)
						const md5 = (await serverAPI.callPluginMethod<{ path: string }, string>("Hash", {path: rom}));
						if (md5.success)
						{
							console.log(md5.result)
							const response = (await serverAPI.fetchNoCors<{ body: string; status: number }>(`https://retroachievements.org/dorequest.php?r=gameid&m=${md5.result}`, {
								method: "GET"
							}))
							if (response.success)
							{
								console.log(response.result)
								if (response.result.status==200)
								{
									const game_id: number = (JSON.parse(response.result.body) as { "Success": boolean, "GameID": number }).GameID;
									if (game_id !== 0)
									{
										const achievement = (await serverAPI.callPluginMethod<GetGameInfoAndUserProgressParams, Game>("GetGameInfoAndUserProgress", {
											game_id
										}));
										if (achievement.success)
										{
											console.log(achievement.result)
											const result: AchievementsData = {
												game_id: game_id,
												game: achievement.result,
												last_updated_at: new Date()
											}
											console.log(result);
											await this.updateCache(`${app_id}`, result);
											resolve(result);
										} else reject(new Error(achievement.result));
									}
									else resolve(undefined);
								} else reject(new Error(`http error code: ${response.result.status}`));
							} else reject(new Error(response.result));
						} else reject(new Error(md5.result));
					} else resolve(undefined);
				} else reject(new Error(`${app_id}: ${shortcut}`));
			}
		});
	}

	async fetchAchievementsData(serverAPI: ServerAPI, app_id: number): Promise<AchievementsData | undefined>
	{
		this.fetchAchievements(serverAPI, app_id);
		let cache = await this.getCache(`${app_id}`)
		if (cache && !await this.needCacheUpdate(cache.last_updated_at, `${app_id}`))
		{
			return cache;
		}
		else
		{
			return await this.getAchievementsForGame(serverAPI, app_id);
		}
	}

	fetchAchievements(serverAPI: ServerAPI, app_id: number): {all: AllAchievements, global: GlobalAchievements}
	{
		console.log(this.achievements);
		console.log(this.loading);
		if (((this.loading)[app_id] == undefined) ? (this.loading)[0] : (this.loading)[app_id])
		{
			console.log("test1");
			return {
				all: {
					loading: true
				},
				global: {
					loading: true
				}
			}
		}
		else if (!((((this.achievements)[app_id] == undefined) ? (this.achievements)[0] : (this.achievements)[app_id]).data))
		{
			(this.loading)[app_id] = true;
			console.log(this.loading);
			this.getAchievementsForGame(serverAPI, app_id).then((retro: AchievementsData | undefined): {all: AllAchievements, global: GlobalAchievements} =>
			{
				let achievements: AllAchievements = {
					data: {
						achieved: {},
						hidden: {},
						unachieved: {}
					},
					loading: false
				}
				let globalAchievements: GlobalAchievements = {
					data: {},
					loading: false
				}
				if (retro && retro.game.achievements)
				{
					retro.game.achievements.forEach(achievement =>
					{
						let steam = retroAchievementToSteamAchievement(achievement, retro.game);
						if (achievements.data  && globalAchievements.data)
						{
							if (steam.bAchieved)
								achievements.data.achieved[steam.strID] = steam
							else
								achievements.data.unachieved[steam.strID] = steam

							globalAchievements.data[steam.strID] = (((achievement.num_awarded ? achievement.num_awarded : 0) / (retro.game.num_distinct_players_casual ? retro.game.num_distinct_players_casual : 1)) * 100.0)
						}
					})
					console.log(achievements, globalAchievements);
					return {
						all: achievements,
						global: globalAchievements
					};
				}
				else
					return {
						all: {
							loading: true,
						},
						global: {
							loading: true,
						}
					}
			}).then(value =>
			{
				(this.achievements)[app_id] = value.all;
				(this.globalAchievements)[app_id] = value.global;
				(this.loading)[app_id] = false;
			});
			return {
				all: {
					loading: true,
				},
				global: {
					loading: true,
				}
			}
		} else
		{
			console.log("test3");
			return {
				all: (this.achievements)[app_id],
				global: (this.globalAchievements)[app_id]
			}
		}
	}

	async init(): Promise<void> {
		let shortcuts = await SteamClient.Apps.GetAllShortcuts()
		for (const app_id of shortcuts.map(shortcut => shortcut.appid))
		{
			await this.fetchAchievementsData(this.serverAPI, app_id);
			this.appDataUnregister = appDetailsStore.RegisterForAppData(app_id, (data) => {
				console.log("got app", data)
				if (!!this.achievements[app_id] && !!data)
				{
					const ret = this.achievements[app_id]?.data
					if (!!ret)
					{
						data.achievements.nAchieved = Object.keys(ret.achieved).length;
						data.achievements.nTotal = Object.keys(ret.achieved).length + Object.keys(ret.unachieved).length;
						// Object.entries(ret.achieved).forEach(([, value]) => {
						// 	data.achievements.vecHighlight.push(value)
						// });
						// Object.entries(ret.unachieved).forEach(([, value]) => {
						// 	data.achievements.vecUnachieved.push(value)
						// });
					}
				}
			});
			let data = appDetailsStore.GetAppDetails(app_id);
			if (!!this.achievements[app_id] && !!data)
			{
				const ret = this.achievements[app_id]?.data
				if (!!ret)
				{
					data.achievements.nAchieved = Object.keys(ret.achieved).length;
					data.achievements.nTotal = Object.keys(ret.achieved).length + Object.keys(ret.unachieved).length;
				}
			}
		}
	}

	deinit(): void {
		if (this.appDataUnregister !== null) {
			this.appDataUnregister.unregister();
			this.appDataUnregister = null;
		}
	}

	isReady(steamAppId: number): boolean {
		console.log(steamAppId, this.achievements[steamAppId])
		console.log(steamAppId, this.achievements[steamAppId]?.loading)
		return !!this.achievements[steamAppId] && !this.achievements[steamAppId].loading;
	}
}