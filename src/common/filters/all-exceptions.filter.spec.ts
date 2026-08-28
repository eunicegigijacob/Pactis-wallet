import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { AllExceptionsFilter } from "./all-exceptions.filter";

describe("AllExceptionsFilter", () => {
  const filter = new AllExceptionsFilter();

  function mockHost(status = jest.fn(), json = jest.fn()): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
      }),
    } as unknown as ArgumentsHost;
  }

  it("returns HttpException status and message without a stack", () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    filter.catch(new HttpException("Nope", HttpStatus.BAD_REQUEST), mockHost(status, json));

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      status: false,
      statusCode: 400,
      message: "Nope",
    });
  });

  it("hides unknown errors from the client", () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const err = new Error("ER_BAD_FIELD_ERROR: SELECT * FROM wallets");

    filter.catch(err, mockHost(status, json));

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      status: false,
      statusCode: 500,
      message: "Internal server error",
    });
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("SELECT");
  });
});
