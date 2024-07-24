use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;

declare_id!("EpwFSsE5z58Tc9MrUa16868pkUG43uAXY6edjyJw35bq");

const STAKING_AMOUNT: u64 = 100_000_000; // 0.1 SOL
const END_GAME_TIME_LIMIT: i64 = 600; // 10 minutes

#[program]
pub mod game {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.total_rooms = 0;
        Ok(())
    }

    pub fn create_room(ctx: Context<CreateRoom>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        let room = &mut ctx.accounts.room;
        let clock = Clock::get()?;

        global_state.total_rooms += 1;
        let room_id = global_state.total_rooms;

        room.creator = *ctx.accounts.creator.key;
        room.staking_amount = STAKING_AMOUNT;
        room.players = vec![*ctx.accounts.creator.key];
        room.state = GameState::Init;
        room.creation_time = clock.unix_timestamp;
        room.winner = Pubkey::default();
        room.room_id = room_id;

        // Transfer staking amount from creator to room
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.room.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, STAKING_AMOUNT)?;

        Ok(())
    }
    

    pub fn join_room(ctx: Context<JoinRoom>) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let clock = Clock::get()?;

        require!(room.state == GameState::Init, GameError::RoomNotInitialized);
        require!(clock.unix_timestamp - room.creation_time <= 300, GameError::RoomClosed);
        require!(!room.players.contains(ctx.accounts.player.key), GameError::PlayerAlreadyJoined);
        require!(room.players.len() < 3, GameError::RoomIsFull);

        room.players.push(*ctx.accounts.player.key);

        if room.players.len() == 3 {
            room.state = GameState::Started;
        }

        // Transfer staking amount from player to room
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.player.to_account_info(),
                to: ctx.accounts.room.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, STAKING_AMOUNT)?;

        Ok(())
    }

    pub fn end_game(ctx: Context<EndGame>, winner: Pubkey) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let clock = Clock::get()?;

        require!(room.state == GameState::Started, GameError::GameNotStarted);
        require!(clock.unix_timestamp - room.creation_time >= END_GAME_TIME_LIMIT, GameError::TooEarlyToEndGame);
        require!(room.players.contains(&winner), GameError::InvalidWinner);

        room.state = GameState::Finished;
        room.winner = winner;

        let total_amount = room.staking_amount
            .checked_mul(room.players.len() as u64)
            .ok_or(GameError::ArithmeticOverflow)?;

        // Transfer total amount to the winner
        **ctx.accounts.room.to_account_info().try_borrow_mut_lamports()? -= total_amount;
        **ctx.accounts.winner.try_borrow_mut_lamports()? += total_amount;

        Ok(())
    }

}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 8,
        seeds = [b"global-state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateRoom<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 8 + (32 * 3) + 1 + 8 + 32 + 8,
        seeds = [b"room", global_state.total_rooms.to_le_bytes().as_ref()],
        bump
    )]
    pub room: Account<'info, Room>,
    #[account(mut)]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinRoom<'info> {
    #[account(mut)]
    pub room: Account<'info, Room>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndGame<'info> {
    #[account(mut)]
    pub room: Account<'info, Room>,
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct GlobalState {
    pub total_rooms: u64,
}

#[account]
pub struct Room {
    pub creator: Pubkey,
    pub staking_amount: u64,
    pub players: Vec<Pubkey>,
    pub state: GameState,
    pub creation_time: i64,
    pub winner: Pubkey,
    pub room_id: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Copy, Debug)]
pub enum GameState {
    Init,
    Started,
    Finished,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RoomInfo {
    pub pubkey: Pubkey,
    pub state: GameState,
    pub sequence_number: u64,
    pub player_count: u8,
}

#[error_code]
pub enum GameError {
    #[msg("Player has already joined the room")]
    PlayerAlreadyJoined,
    #[msg("Room is full")]
    RoomIsFull,
    #[msg("Game has not started yet")]
    GameNotStarted,
    #[msg("Winner is not a player in the room")]
    InvalidWinner,
    #[msg("Arithmetic overflow occurred")]
    ArithmeticOverflow,
    #[msg("Too Early To End Game")]
    TooEarlyToEndGame,
    #[msg("Room is not in initialized state")]
    RoomNotInitialized,
    #[msg("Room is closed for joining")]
    RoomClosed,
}
