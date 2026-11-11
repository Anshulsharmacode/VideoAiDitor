import { RestapiController } from './restapi.controller.js';

const mongo = vi.hoisted(() => ({
  client: { connect: vi.fn(), close: vi.fn() },
  database: { command: vi.fn() },
}));

vi.mock('../common/mongodb/monogo.js', () => ({
  createMongoConnection: () => mongo,
}));

describe('RestapiController MongoDB lifecycle', () => {
  let controller: RestapiController;

  beforeEach(() => {
    vi.resetAllMocks();
    controller = new RestapiController();
  });

  it('connects and verifies MongoDB on initialization', async () => {
    await controller.onModuleInit();
    expect(mongo.client.connect).toHaveBeenCalledOnce();
    expect(mongo.database.command).toHaveBeenCalledWith({ ping: 1 });
  });

  it('closes the client and fails startup without exposing the URI', async () => {
    mongo.client.connect.mockRejectedValueOnce(
      new Error('mongodb://private:password@host'),
    );
    await expect(controller.onModuleInit()).rejects.toThrow(
      'MongoDB connection failed. Check MONGODB_URI and MONGODB_DATABASE in backend/.env.',
    );
    expect(mongo.client.close).toHaveBeenCalledOnce();
  });

  it('reports successful health checks', async () => {
    await expect(controller.checkDatabase()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
  });

  it('returns HTTP 503 for failed health checks', async () => {
    mongo.database.command.mockRejectedValueOnce(
      new Error('private connection details'),
    );
    await expect(controller.checkDatabase()).rejects.toMatchObject({
      status: 503,
    });
  });

  it('closes the connection on shutdown', async () => {
    await controller.onModuleDestroy();
    expect(mongo.client.close).toHaveBeenCalledOnce();
  });
});
