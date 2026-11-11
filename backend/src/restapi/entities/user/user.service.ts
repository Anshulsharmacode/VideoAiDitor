import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../../../common/mongodb/database.module.js';
import { getCollections } from '../../../common/mongodb/collections.js';
import { newId, newTimestamps } from '../../../common/mongodb/schemas/base.schema.js';
import type { UserDocument } from '../../../common/mongodb/schemas/user.schema.js';
import { TeamService } from '../team/team.service.js';
import type { AuthResponse, LoginDto, RegisterDto } from './user.dto.js';

const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
export class UserService {
  constructor(
    @Inject(MONGO_DB) private readonly db: Db,
    private readonly jwtService: JwtService,
    private readonly teamService: TeamService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const { users } = getCollections(this.db);
    const email = dto.email.trim().toLowerCase();

    const existing = await users.findOne({ email });
    if (existing) throw new ConflictException('Email is already registered');

    const user: UserDocument = {
      _id: newId(),
      name: dto.name.trim(),
      email,
      passwordHash: await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS),
      status: 'active',
      ...newTimestamps(),
    };
    await users.insertOne(user);
    await this.teamService.createPersonalTeam(user._id, user.name);

    return this.toAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const { users } = getCollections(this.db);
    const email = dto.email.trim().toLowerCase();

    const user = await users.findOne({ email });
    if (!user || user.status !== 'active') throw new UnauthorizedException('Invalid email or password');

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Invalid email or password');

    return this.toAuthResponse(user);
  }

  async findById(userId: string): Promise<Pick<UserDocument, '_id' | 'name' | 'email' | 'status'> | null> {
    const { users } = getCollections(this.db);
    const user = await users.findOne(
      { _id: userId },
      { projection: { _id: 1, name: 1, email: 1, status: 1 } },
    );
    return user as Pick<UserDocument, '_id' | 'name' | 'email' | 'status'> | null;
  }

  private async toAuthResponse(user: UserDocument): Promise<AuthResponse> {
    const accessToken = await this.jwtService.signAsync({ sub: user._id, email: user.email });
    return {
      accessToken,
      user: { id: user._id, name: user.name, email: user.email },
    };
  }
}
